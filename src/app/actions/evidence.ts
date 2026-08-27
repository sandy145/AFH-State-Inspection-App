"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser, toActor } from "@/lib/session";
import { AccessDeniedError, requireFindingAccess } from "@/data/scope";
import { canRequestEvidence, canReviewEvidence, canSubmitEvidence } from "@/domain/authz";
import { createEvidenceRequest, reviewEvidence, submitEvidence } from "@/data/evidence";
import { acknowledgeConsultation, postMessage } from "@/data/cases";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/domain/types";
import type { ReviewOutcome } from "@/domain/types";

/**
 * Server actions for the evidence workflow.
 *
 * Each one re-checks authorization even though the page that rendered the form
 * already did. A form post is a separate request and must stand on its own.
 * Errors come back as state so the page can announce them in an aria-live
 * region rather than throwing the user into an error screen.
 */
export interface ActionState {
  error?: string;
  success?: string;
}

function messageFor(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (error instanceof AccessDeniedError) return error.message;
  console.error("[action] unexpected failure", error);
  return "Something went wrong. Nothing was saved. Please try again.";
}

const requestSchema = z.object({
  findingId: z.string().uuid(),
  title: z.string().min(3, "Give the request a title."),
  instructions: z.string().min(10, "Explain what the provider should send."),
  itemsRequested: z.string().min(3, "List the documents or information requested."),
  dueAt: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  allowMultipleFiles: z.string().optional(),
  explanationRequired: z.string().optional(),
});

export async function requestEvidenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  try {
    const scope = await requireFindingAccess(toActor(user), parsed.data.findingId);
    if (!canRequestEvidence(toActor(user), scope)) {
      return { error: "You are not assigned to this inspection." };
    }

    await createEvidenceRequest(user, {
      findingId: parsed.data.findingId,
      title: parsed.data.title,
      instructions: parsed.data.instructions,
      itemsRequested: parsed.data.itemsRequested,
      dueAt: parsed.data.dueAt ? new Date(`${parsed.data.dueAt}T00:00:00.000Z`) : null,
      priority: parsed.data.priority,
      allowMultipleFiles: parsed.data.allowMultipleFiles === "on",
      explanationRequired: parsed.data.explanationRequired === "on",
    });

    revalidatePath(`/inspections/${scope.id}`);
    return { success: "Evidence request sent. The provider has been notified." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function submitEvidenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const evidenceRequestId = String(formData.get("evidenceRequestId") ?? "");
  const explanation = String(formData.get("providerExplanation") ?? "");
  const supersedes = String(formData.get("supersedesSubmissionId") ?? "");

  const uploads = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (uploads.length === 0) return { error: "Choose at least one file to upload." };

  let receiptId: string | null = null;

  try {
    const request = await prisma.evidenceRequest.findUnique({
      where: { id: evidenceRequestId },
      select: { finding: { select: { id: true } } },
    });
    if (!request) return { error: "That evidence request could not be found." };

    const scope = await requireFindingAccess(toActor(user), request.finding.id);
    if (!canSubmitEvidence(toActor(user), scope)) {
      return { error: "You cannot submit evidence for this inspection." };
    }

    const files = await Promise.all(
      uploads.map(async (file) => ({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        body: Buffer.from(await file.arrayBuffer()),
      })),
    );

    const result = await submitEvidence(user, {
      evidenceRequestId,
      files,
      providerExplanation: explanation || null,
      supersedesSubmissionId: supersedes || null,
    });

    receiptId = result.submissionId;
    revalidatePath("/provider");
  } catch (error) {
    return { error: messageFor(error) };
  }

  // Straight to the receipt: the provider's first question after uploading is
  // always "did that actually arrive?" (§34).
  redirect(`/receipts/${receiptId}`);
}

const reviewSchema = z.object({
  submissionId: z.string().uuid(),
  outcome: z.enum([
    "ACCEPTED",
    "PARTIALLY_ACCEPTED",
    "INSUFFICIENT",
    "WRONG_DOCUMENT",
    "ADDITIONAL_INFO_REQUIRED",
    "SUPERSEDED",
    "NOT_APPLICABLE",
  ]),
  reason: z.string().optional(),
});

export async function reviewEvidenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  try {
    const submission = await prisma.evidenceSubmission.findUnique({
      where: { id: parsed.data.submissionId },
      select: { findingId: true },
    });
    if (!submission) return { error: "That submission could not be found." };

    const scope = await requireFindingAccess(toActor(user), submission.findingId);
    if (!canReviewEvidence(toActor(user), scope)) {
      return { error: "You are not assigned to review evidence on this inspection." };
    }

    await reviewEvidence(user, {
      submissionId: parsed.data.submissionId,
      outcome: parsed.data.outcome as ReviewOutcome,
      reason: parsed.data.reason ?? null,
    });

    revalidatePath("/inspector/review");
    revalidatePath(`/inspections/${scope.id}`);
    return { success: "Determination recorded. The provider has been notified." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function postMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const findingId = String(formData.get("findingId") ?? "");
  const body = String(formData.get("body") ?? "");
  const isInternal = formData.get("isInternal") === "on";

  try {
    await requireFindingAccess(toActor(user), findingId);
    await postMessage(user, findingId, body, isInternal);
    revalidatePath(`/provider/findings/${findingId}`);
    return { success: "Message sent." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

/** Provider acknowledgement of a consultation (§12). Records receipt, not agreement. */
export async function acknowledgeConsultationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const findingId = String(formData.get("findingId") ?? "");

  try {
    await requireFindingAccess(toActor(user), findingId);
    await acknowledgeConsultation(user, findingId);
    revalidatePath(`/provider/findings/${findingId}`);
    return { success: "Acknowledged. This records that you have seen it." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}
