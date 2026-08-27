import { redirect } from "next/navigation";
import { currentUser, toActor } from "@/lib/session";
import { canAdminister } from "@/domain/authz";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/domain/deadlines";
import { Alert } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/misc";
import { DeadlineRuleForm } from "./deadline-rule-form";

export const metadata = { title: "Deadline configuration" };

/**
 * Deadline configuration (§33).
 *
 * Offsets are data, so RCS can set the values the regulations actually require
 * without a code change. The seeded values are placeholders and this page says
 * so — nobody should discover that by reading the seed file.
 */
export default async function DeadlinesAdmin() {
  const user = (await currentUser())!;
  if (!canAdminister(toActor(user))) redirect("/");

  const [rules, holidays] = await Promise.all([
    prisma.deadlineRule.findMany({ orderBy: { key: "asc" } }),
    prisma.holiday.findMany({ orderBy: { date: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Deadline configuration"
        description="The intervals the workflow applies when it computes a due date."
      />

      <Alert tone="warning" title="Confirm these values against current rule and policy" className="mb-6">
        The intervals shipped with this prototype are placeholders for demonstration. They are not a
        statement of what Washington law requires. Set them from the applicable WAC, RCW and RCS
        policy before this system is used for real casework. Changing a rule here does not move a
        deadline that has already been computed on an open case.
      </Alert>

      <div className="space-y-4">
        {rules.map((rule) => (
          <Card key={rule.id}>
            <CardHeader>
              <CardTitle>{rule.label}</CardTitle>
              <p className="font-mono text-xs text-muted-foreground">{rule.key}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {rule.description ? <p className="text-sm text-muted-foreground">{rule.description}</p> : null}
              <p className="text-sm">
                Triggered by:{" "}
                <span className="font-medium">{rule.trigger.replace(/_/g, " ").toLowerCase()}</span>
              </p>
              <DeadlineRuleForm
                ruleId={rule.id}
                offset={rule.offset}
                unit={rule.unit}
                authority={rule.authority}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Holiday calendar</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Working-day deadlines skip weekends and every date listed here.
        </p>
        <DataTable caption="Configured holidays" headers={["Date", "Holiday"]} empty="No holidays configured.">
          {holidays.map((holiday) => (
            <Row key={holiday.id}>
              <Cell className="whitespace-nowrap">{formatDate(holiday.date)}</Cell>
              <Cell>{holiday.name}</Cell>
            </Row>
          ))}
        </DataTable>
      </section>
    </>
  );
}
