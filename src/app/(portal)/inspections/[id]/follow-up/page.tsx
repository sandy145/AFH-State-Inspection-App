import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireInspectionAccessOrNotFound } from "@/data/scope";
import { canEditInspection } from "@/domain/authz";
import { formatDate } from "@/domain/deadlines";
import { FOLLOW_UP_METHOD_LABELS } from "@/domain/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, EmptyState } from "@/components/ui/misc";
import { CompleteFollowUpForm, ScheduleFollowUpForm } from "./follow-up-forms";

export const metadata = { title: "Follow-up" };

/** Follow-up verification (§16). */
export default async function FollowUpTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;
  const scope = await requireInspectionAccessOrNotFound(toActor(user), id);

  const [followUps, citations] = await Promise.all([
    prisma.followUp.findMany({
      where: { inspectionId: id },
      include: {
        assignedTo: { select: { fullName: true } },
        citation: { select: { citationNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.citation.findMany({
      where: { finding: { inspectionId: id }, status: { notIn: ["DRAFT", "RESCINDED"] } },
      select: { id: true, citationNumber: true },
    }),
  ]);

  const mayEdit = canEditInspection(toActor(user), scope);

  return (
    <div className="space-y-6">
      {followUps.length === 0 ? (
        <EmptyState title="No follow-up scheduled on this case." />
      ) : (
        <div className="space-y-4">
          {followUps.map((followUp) => (
            <Card key={followUp.id}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <CardTitle>
                  {FOLLOW_UP_METHOD_LABELS[followUp.method]}
                  {followUp.citation ? ` · ${followUp.citation.citationNumber}` : ""}
                </CardTitle>
                <StatusBadge
                  label={
                    followUp.completedAt
                      ? followUp.backInCompliance
                        ? "Back in compliance"
                        : "Completed"
                      : "Scheduled"
                  }
                  tone={
                    followUp.completedAt ? (followUp.backInCompliance ? "success" : "warning") : "info"
                  }
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <DescriptionList
                  items={[
                    {
                      label: "Scheduled for",
                      value: followUp.scheduledFor ? formatDate(followUp.scheduledFor) : "Not scheduled",
                    },
                    { label: "Assigned to", value: followUp.assignedTo?.fullName ?? "—" },
                    {
                      label: "Completed",
                      value: followUp.completedAt ? formatDate(followUp.completedAt) : "Not yet",
                    },
                    { label: "Result", value: followUp.result.replace(/_/g, " ").toLowerCase() },
                    { label: "Evidence reviewed", value: followUp.evidenceReviewed ?? "—" },
                    {
                      label: "Additional deficiencies",
                      value: followUp.additionalDeficiencies ?? "None identified",
                    },
                    { label: "Notes", value: followUp.notes ?? "—" },
                  ]}
                />

                {mayEdit && !followUp.completedAt ? <CompleteFollowUpForm followUpId={followUp.id} /> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {mayEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Schedule follow-up verification</CardTitle>
          </CardHeader>
          <CardContent>
            <ScheduleFollowUpForm inspectionId={id} citations={citations} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
