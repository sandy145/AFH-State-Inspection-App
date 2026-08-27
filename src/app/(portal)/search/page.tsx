import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { findingScope, inspectionScope, facilityScope } from "@/data/scope";
import { formatDate } from "@/domain/deadlines";
import { FINDING_STATUS_META, INSPECTION_STATUS_META } from "@/domain/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionHeading } from "@/components/ui/misc";

export const metadata = { title: "Search" };

/**
 * Search (§35).
 *
 * Every query below starts from a scope filter, so a search can never return a
 * record the signed-in user could not open directly. There is no "search
 * everything" path.
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const user = (await currentUser())!;
  const actor = toActor(user);
  const term = q.trim();

  const contains = { contains: term, mode: "insensitive" as const };

  const [inspections, findings, facilities, citations] = term
    ? await Promise.all([
        prisma.inspection.findMany({
          where: {
            ...inspectionScope(actor),
            OR: [
              { caseNumber: contains },
              { facility: { name: contains } },
              { facility: { licenseNumber: contains } },
            ],
          },
          include: { facility: { select: { name: true, licenseNumber: true } } },
          take: 20,
        }),
        prisma.finding.findMany({
          where: {
            ...findingScope(actor),
            OR: [
              { reference: contains },
              { title: contains },
              { regulation: { citation: contains } },
            ],
          },
          include: {
            regulation: { select: { citation: true, source: true } },
            inspection: { select: { id: true, caseNumber: true, facility: { select: { name: true } } } },
          },
          take: 20,
        }),
        prisma.facility.findMany({
          where: {
            ...facilityScope(actor),
            OR: [{ name: contains }, { licenseNumber: contains }, { city: contains }],
          },
          take: 10,
        }),
        prisma.citation.findMany({
          where: {
            finding: findingScope(actor),
            OR: [{ citationNumber: contains }, { regulation: { citation: contains } }],
          },
          include: {
            finding: { select: { reference: true, inspection: { select: { id: true, caseNumber: true } } } },
          },
          take: 20,
        }),
      ])
    : [[], [], [], []];

  const total = inspections.length + findings.length + facilities.length + citations.length;

  return (
    <>
      <PageHeader
        title="Search"
        description="Case numbers, homes, licence numbers, findings, citations and regulatory references — within your access."
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-[20rem] flex-1 space-y-1.5">
          <label htmlFor="q" className="block text-sm font-medium">
            Search term
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="AFH-2026-001284, Sunrise, 123456, 388-76-10506" />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {term ? (
        <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
          {total} {total === 1 ? "result" : "results"} for “{term}”.
        </p>
      ) : null}

      {term && total === 0 ? <EmptyState title="No results" description="Nothing within your access matches that term." /> : null}

      {inspections.length > 0 ? (
        <section className="mb-6">
          <SectionHeading>Inspections</SectionHeading>
          <ul className="space-y-2">
            {inspections.map((inspection) => (
              <li key={inspection.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-4">
                <div>
                  <Link href={`/inspections/${inspection.id}`} className="font-medium underline-offset-2 hover:underline">
                    {inspection.caseNumber}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {inspection.facility.name} · licence {inspection.facility.licenseNumber} ·{" "}
                    started {formatDate(inspection.startedAt)}
                  </p>
                </div>
                <StatusBadge
                  label={INSPECTION_STATUS_META[inspection.status].label}
                  tone={INSPECTION_STATUS_META[inspection.status].tone}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {findings.length > 0 ? (
        <section className="mb-6">
          <SectionHeading>Findings</SectionHeading>
          <ul className="space-y-2">
            {findings.map((finding) => (
              <li key={finding.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-4">
                <div>
                  <Link
                    href={`/inspections/${finding.inspection.id}/findings/${finding.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {finding.reference} — {finding.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {finding.inspection.caseNumber} · {finding.inspection.facility.name}
                    {finding.regulation ? ` · ${finding.regulation.source} ${finding.regulation.citation}` : ""}
                  </p>
                </div>
                <StatusBadge
                  label={FINDING_STATUS_META[finding.status].label}
                  tone={FINDING_STATUS_META[finding.status].tone}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {citations.length > 0 ? (
        <section className="mb-6">
          <SectionHeading>Citations</SectionHeading>
          <ul className="space-y-2">
            {citations.map((citation) => (
              <li key={citation.id} className="rounded-lg border bg-card p-4">
                <Link
                  href={`/inspections/${citation.finding.inspection.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {citation.citationNumber}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {citation.finding.inspection.caseNumber} · finding {citation.finding.reference}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {facilities.length > 0 ? (
        <section>
          <SectionHeading>Adult family homes</SectionHeading>
          <ul className="space-y-2">
            {facilities.map((facility) => (
              <li key={facility.id} className="rounded-lg border bg-card p-4">
                <Link href={`/inspections?q=${facility.licenseNumber}`} className="font-medium underline-offset-2 hover:underline">
                  {facility.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  Licence {facility.licenseNumber} · {facility.city}, {facility.state}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
