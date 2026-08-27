import { prisma } from "@/lib/prisma";
import { Alert } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/misc";
import { RegulationForm } from "./regulation-form";

export const metadata = { title: "Regulation references" };

/** WAC / RCW reference data (§4). Findings link to these rows. */
export default async function RegulationsAdmin() {

  const regulations = await prisma.regulation.findMany({
    include: { _count: { select: { findings: true, citations: true } } },
    orderBy: [{ source: "asc" }, { citation: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Regulation references"
        description="The WAC and RCW references a finding, evidence request or citation can be linked to."
      />

      <Alert tone="warning" title="Summaries here are working text, not the rule" className="mb-6">
        The authoritative text is the published Washington Administrative Code and Revised Code of
        Washington. The summaries and guidance stored here are aids for inspectors. Guidance is shown
        to staff and never used to decide anything automatically.
      </Alert>

      <DataTable
        caption="Regulation references"
        headers={["Citation", "Title", "Summary", "Findings", "Citations", "Link"]}
      >
        {regulations.map((regulation) => (
          <Row key={regulation.id}>
            <Cell className="whitespace-nowrap font-medium">
              {regulation.source} {regulation.citation}
            </Cell>
            <Cell className="text-sm">{regulation.title}</Cell>
            <Cell className="max-w-md text-xs text-muted-foreground">{regulation.summary ?? "—"}</Cell>
            <Cell className="tabular-nums">{regulation._count.findings}</Cell>
            <Cell className="tabular-nums">{regulation._count.citations}</Cell>
            <Cell>
              {regulation.url ? (
                <a
                  href={regulation.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm underline underline-offset-2"
                >
                  Published rule
                </a>
              ) : (
                "—"
              )}
            </Cell>
          </Row>
        ))}
      </DataTable>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Add or update a reference</CardTitle>
        </CardHeader>
        <CardContent>
          <RegulationForm />
        </CardContent>
      </Card>
    </>
  );
}
