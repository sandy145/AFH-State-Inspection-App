"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser, toActor } from "@/lib/session";
import { requireFindingAccess, requireInspectionAccess, AccessDeniedError } from "@/data/scope";
import {
  canIssueCitation,
  canOverrideEvidenceGuard,
  canApproveOverride,
  canRequestIDR,
  canReviewEvidence,
  canSubmitCorrection,
  canEditInspection,
} from "@/domain/authz";
import { draftCitation, finalizeCitation, issueConsultation, approveOverride, rescindCitation } from "@/data/citations";
import { markBackInCompliance, reviewCorrection, submitCorrection } from "@/data/corrections";
import { advanceIDR, requestIDR } from "@/data/idr";
import { completeFollowUp, scheduleFollowUp } from "@/data/followups";
import { createFinding, resolveFinding, setInspectionStatus } from "@/data/cases";
import { DomainError } from "@/domain/types";
import type { ActionState } from "@/app/actions/evidence";

/**
 * Outcome actions: consultation, citation, correction, IDR, follow-up.
 *
 * The pattern is the same throughout — resolve the actor, re-check access
 * against the record, delegate to the data layer, and hand any refusal back as
 * a message rather than an exception page. The citation path is the one that
 * matters most: `finalizeCitation` runs the unreviewed-evidence guard, and a
 * blocked attempt is surfaced here verbatim.
 */
function messageFor(error: unknown): string {
  if (error instanceof DomainError || error instanceof AccessDeniedError) return error.message;
  console.error("[action] unexpected failure", error);
  return "Something went wrong. Nothing was saved. Please try again.";
}

async function actorOrNull() {
  const user = await currentUser();
  return user;
}

// --- Findings --------------------------------------------------------------

export async function createFindingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const schema = z.object({
    inspectionId: z.string().uuid(),
    title: z.string().min(3, "Give the finding a title."),
    observation: z.string().min(10, "Describe what was observed."),
    regulationId: z.string().uuid().optional().or(z.literal("")),
    residentIdentifier: z.string().optional(),
    potentialOutcome: z
      .enum(["UNDETERMINED", "LIKELY_NO_VIOLATION", "POSSIBLE_CONSULTATION", "POSSIBLE_CITATION"])
      .default("UNDETERMINED"),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  try {
    const scope = await requireInspectionAccess(toActor(user), parsed.data.inspectionId);
    if (!canEditInspection(toActor(user), scope)) return { error: "You are not assigned to this inspection." };

    await createFinding(user, {
      inspectionId: parsed.data.inspectionId,
      title: parsed.data.title,
      observation: parsed.data.observation,
      regulationId: parsed.data.regulationId || null,
      // A redacted identifier, never a resident's name (§24).
      residentIdentifier: parsed.data.residentIdentifier?.trim() || null,
      potentialOutcome: parsed.data.potentialOutcome,
    });

    revalidatePath(`/inspections/${parsed.data.inspectionId}`);
    return { success: "Finding created." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function resolveFindingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const findingId = String(formData.get("findingId") ?? "");
  const note = String(formData.get("note") ?? "");

  try {
    const scope = await requireFindingAccess(toActor(user), findingId);
    if (!canReviewEvidence(toActor(user), scope)) return { error: "You cannot resolve findings on this case." };

    await resolveFinding(user, findingId, "RESOLVED_NO_VIOLATION", note);
    revalidatePath(`/inspections/${scope.id}`);
    return { success: "Finding resolved — no violation established." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

// --- Consultation ----------------------------------------------------------

export async function issueConsultationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const schema = z.object({
    findingId: z.string().uuid(),
    issueDescription: z.string().min(10, "Describe the issue."),
    rationale: z.string().min(10, "Record why consultation was selected."),
    evidenceRelied: z.string().optional(),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  try {
    const scope = await requireFindingAccess(toActor(user), parsed.data.findingId);
    if (!canIssueCitation(toActor(user), scope)) return { error: "You cannot record outcomes on this case." };

    await issueConsultation(user, {
      findingId: parsed.data.findingId,
      issueDescription: parsed.data.issueDescription,
      rationale: parsed.data.rationale,
      evidenceRelied: parsed.data.evidenceRelied || null,
    });

    revalidatePath(`/inspections/${scope.id}`);
    return { success: "Consultation recorded." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

// --- Citation --------------------------------------------------------------

export async function draftCitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const schema = z.object({
    findingId: z.string().uuid(),
    deficientPractice: z.string().min(10, "Describe the deficient practice."),
    inspectorAnalysis: z.string().min(10, "Record your analysis."),
    evidenceRelied: z.string().optional(),
    riskLevel: z.enum(["NOT_CLASSIFIED", "LOW", "MODERATE", "HIGH", "IMMEDIATE_JEOPARDY"]).default("NOT_CLASSIFIED"),
    planOfCorrectionRequired: z.string().optional(),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  try {
    const scope = await requireFindingAccess(toActor(user), parsed.data.findingId);
    if (!canIssueCitation(toActor(user), scope)) return { error: "You cannot record outcomes on this case." };

    await draftCitation(user, {
      findingId: parsed.data.findingId,
      deficientPractice: parsed.data.deficientPractice,
      inspectorAnalysis: parsed.data.inspectorAnalysis,
      evidenceRelied: parsed.data.evidenceRelied || null,
      riskLevel: parsed.data.riskLevel,
      planOfCorrectionRequired: parsed.data.planOfCorrectionRequired === "on",
    });

    revalidatePath(`/inspections/${scope.id}`);
    return { success: "Citation drafted. Review the evidence summary before finalizing." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

/**
 * The guarded action. With unreviewed evidence and no justification, the data
 * layer refuses and audits the refusal; the message comes straight back to the
 * inspector.
 */
export async function finalizeCitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const citationId = String(formData.get("citationId") ?? "");
  const serviceMethod = String(formData.get("serviceMethod") ?? "");
  const servedAt = String(formData.get("servedAt") ?? "");
  const receivedAt = String(formData.get("receivedAt") ?? "");
  const overrideJustification = String(formData.get("overrideJustification") ?? "");

  try {
    const citation = await prisma.citation.findUnique({
      where: { id: citationId },
      select: { findingId: true },
    });
    if (!citation) return { error: "That citation could not be found." };

    const scope = await requireFindingAccess(toActor(user), citation.findingId);
    if (!canIssueCitation(toActor(user), scope)) return { error: "You cannot finalize citations on this case." };
    if (overrideJustification.trim() && !canOverrideEvidenceGuard(toActor(user), scope)) {
      return { error: "You are not authorized to override the evidence review requirement." };
    }

    const result = await finalizeCitation(user, {
      citationId,
      serviceMethod: serviceMethod ? (serviceMethod as never) : null,
      servedAt: servedAt ? new Date(`${servedAt}T00:00:00.000Z`) : null,
      receivedAt: receivedAt ? new Date(`${receivedAt}T00:00:00.000Z`) : null,
      overrideJustification: overrideJustification.trim() || null,
    });

    revalidatePath(`/inspections/${scope.id}`);

    if (result.pendingFieldManagerApproval) {
      return {
        success:
          `Citation ${result.citationNumber} was finalized using an override and is waiting for ` +
          "Field Manager approval. The override is recorded in the audit history.",
      };
    }
    return { success: `Citation ${result.citationNumber} finalized.` };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function approveOverrideAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const citationId = String(formData.get("citationId") ?? "");
  const note = String(formData.get("note") ?? "");

  try {
    const citation = await prisma.citation.findUnique({ where: { id: citationId }, select: { findingId: true } });
    if (!citation) return { error: "That citation could not be found." };

    const scope = await requireFindingAccess(toActor(user), citation.findingId);
    if (!canApproveOverride(toActor(user), scope)) {
      return { error: "Only a Field Manager for this region can approve an override." };
    }

    await approveOverride(user, citationId, note || undefined);
    revalidatePath(`/inspections/${scope.id}`);
    return { success: "Override approved and recorded." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function rescindCitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const citationId = String(formData.get("citationId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  try {
    const citation = await prisma.citation.findUnique({ where: { id: citationId }, select: { findingId: true } });
    if (!citation) return { error: "That citation could not be found." };

    const scope = await requireFindingAccess(toActor(user), citation.findingId);
    if (!canIssueCitation(toActor(user), scope)) return { error: "You cannot modify citations on this case." };

    await rescindCitation(user, citationId, reason);
    revalidatePath(`/inspections/${scope.id}`);
    return { success: "Citation rescinded." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

// --- Correction ------------------------------------------------------------

export async function submitCorrectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const correctionId = String(formData.get("correctionId") ?? "");
  const uploads = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  try {
    const correction = await prisma.correction.findUnique({
      where: { id: correctionId },
      select: { citation: { select: { findingId: true } } },
    });
    if (!correction) return { error: "That correction could not be found." };

    const scope = await requireFindingAccess(toActor(user), correction.citation.findingId);
    if (!canSubmitCorrection(toActor(user), scope)) return { error: "You cannot submit this correction." };

    const files = await Promise.all(
      uploads.map(async (file) => ({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        body: Buffer.from(await file.arrayBuffer()),
      })),
    );

    await submitCorrection(user, {
      correctionId,
      howCorrected: String(formData.get("howCorrected") ?? ""),
      correctionCompletedAt: new Date(`${String(formData.get("correctionCompletedAt") ?? "")}T00:00:00.000Z`),
      howMaintained: String(formData.get("howMaintained") ?? ""),
      responsiblePerson: String(formData.get("responsiblePerson") ?? ""),
      signatureName: String(formData.get("signatureName") ?? ""),
      signatureTitle: String(formData.get("signatureTitle") ?? "") || null,
      files,
    });

    revalidatePath("/provider/corrections");
    return { success: "Correction submitted. The inspector has been notified." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function reviewCorrectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const correctionId = String(formData.get("correctionId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "");

  try {
    const correction = await prisma.correction.findUnique({
      where: { id: correctionId },
      select: { citation: { select: { findingId: true } } },
    });
    if (!correction) return { error: "That correction could not be found." };

    const scope = await requireFindingAccess(toActor(user), correction.citation.findingId);
    if (!canReviewEvidence(toActor(user), scope)) return { error: "You cannot review corrections on this case." };

    if (decision === "BACK_IN_COMPLIANCE") {
      await markBackInCompliance(user, correctionId, note || undefined);
      revalidatePath(`/inspections/${scope.id}`);
      return { success: "Recorded as back in compliance." };
    }

    await reviewCorrection(user, {
      correctionId,
      decision: decision as "ACCEPTED" | "ADDITIONAL_INFO_REQUESTED" | "CORRECTION_VERIFICATION_REQUIRED",
      note: note || null,
    });

    revalidatePath(`/inspections/${scope.id}`);
    return { success: "Correction reviewed." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

// --- IDR -------------------------------------------------------------------

export async function requestIDRAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const citationId = String(formData.get("citationId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const requestedMethod = String(formData.get("requestedMethod") ?? "DESK_REVIEW");
  const supportingEvidence = String(formData.get("supportingEvidence") ?? "");

  try {
    const citation = await prisma.citation.findUnique({ where: { id: citationId }, select: { findingId: true } });
    if (!citation) return { error: "That citation could not be found." };

    const scope = await requireFindingAccess(toActor(user), citation.findingId);
    if (!canRequestIDR(toActor(user), scope)) return { error: "You cannot dispute this citation." };

    const request = await requestIDR(user, {
      citationId,
      reason,
      requestedMethod: requestedMethod as never,
      supportingEvidence: supportingEvidence || null,
    });

    revalidatePath("/provider");
    return {
      success:
        `Dispute ${request.reference} submitted. Your correction obligations are unchanged except ` +
        "where law or DSHS policy provides otherwise.",
    };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function advanceIDRAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const idrRequestId = String(formData.get("idrRequestId") ?? "");
  const status = String(formData.get("status") ?? "");
  const decisionSummary = String(formData.get("decisionSummary") ?? "");

  try {
    const request = await prisma.iDRRequest.findUnique({
      where: { id: idrRequestId },
      select: { citation: { select: { findingId: true } } },
    });
    if (!request) return { error: "That dispute could not be found." };

    const scope = await requireFindingAccess(toActor(user), request.citation.findingId);
    if (!canReviewEvidence(toActor(user), scope)) return { error: "You cannot process disputes on this case." };

    await advanceIDR(user, {
      idrRequestId,
      status: status as never,
      decisionSummary: decisionSummary || null,
    });

    revalidatePath(`/inspections/${scope.id}`);
    return { success: "Dispute updated." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

// --- Follow-up -------------------------------------------------------------

export async function scheduleFollowUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const inspectionId = String(formData.get("inspectionId") ?? "");
  const method = String(formData.get("method") ?? "DOCUMENT_REVIEW");
  const scheduledFor = String(formData.get("scheduledFor") ?? "");
  const citationId = String(formData.get("citationId") ?? "");

  try {
    const scope = await requireInspectionAccess(toActor(user), inspectionId);
    if (!canEditInspection(toActor(user), scope)) return { error: "You are not assigned to this inspection." };

    await scheduleFollowUp(user, {
      inspectionId,
      citationId: citationId || null,
      method: method as never,
      scheduledFor: scheduledFor ? new Date(`${scheduledFor}T00:00:00.000Z`) : null,
      notes: String(formData.get("notes") ?? "") || null,
    });

    revalidatePath(`/inspections/${inspectionId}`);
    return { success: "Follow-up scheduled." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function completeFollowUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const followUpId = String(formData.get("followUpId") ?? "");
  const result = String(formData.get("result") ?? "");

  try {
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      select: { inspectionId: true },
    });
    if (!followUp) return { error: "That follow-up could not be found." };

    const scope = await requireInspectionAccess(toActor(user), followUp.inspectionId);
    if (!canEditInspection(toActor(user), scope)) return { error: "You are not assigned to this inspection." };

    await completeFollowUp(user, {
      followUpId,
      result: result as never,
      backInCompliance: formData.get("backInCompliance") === "on",
      evidenceReviewed: String(formData.get("evidenceReviewed") ?? "") || null,
      additionalDeficiencies: String(formData.get("additionalDeficiencies") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
    });

    revalidatePath(`/inspections/${followUp.inspectionId}`);
    return { success: "Follow-up recorded." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function setInspectionStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actorOrNull();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const inspectionId = String(formData.get("inspectionId") ?? "");
  const status = String(formData.get("status") ?? "");

  try {
    const scope = await requireInspectionAccess(toActor(user), inspectionId);
    if (!canEditInspection(toActor(user), scope)) return { error: "You are not assigned to this inspection." };

    await setInspectionStatus(user, inspectionId, status as never);
    revalidatePath(`/inspections/${inspectionId}`);
    return { success: "Inspection status updated." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}
