import Link from "next/link";
import { AdministrationBand, Breadcrumb, SiteBanner, SiteFooter } from "@/components/site-chrome";

export const metadata = { title: "About this prototype" };

/**
 * The public information page the footer links to.
 *
 * Reachable without signing in, deliberately: the things it says — what this is,
 * what it is not, what it does with data — are exactly what someone who lands on
 * a login page resembling a state system deserves to be able to read first.
 */
export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteBanner />
      <AdministrationBand />
      <Breadcrumb trail={[{ label: "Home", href: "/" }, { label: "About this prototype" }]} />

      <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8">
        <h1 className="text-[1.75rem] font-normal leading-tight text-primary">About this prototype</h1>

        <div className="mt-4 max-w-3xl space-y-8 text-[0.95rem] leading-relaxed">
          <section>
            <div className="border-l-4 border-administration bg-administration/10 p-4">
              <p className="font-semibold">Not a Washington State system</p>
              <p className="mt-1">
                This is an independent demonstration built to explore how the Adult Family Home
                inspection and evidence process could work. It is{" "}
                <strong>not affiliated with, operated by, or endorsed by</strong> the Washington State
                Department of Social and Health Services, the Aging and Long-Term Support
                Administration, or Residential Care Services.
              </p>
              <p className="mt-2">
                It is not an authoritative licensing record. For official information about licensed
                Adult Family Homes, use the department&rsquo;s own published resources.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold">What it demonstrates</h2>
            <p className="mt-2">
              Today much of the exchange between a provider and an inspector happens over email.
              Evidence gets buried in threads, attachments are overlooked, and nobody has a single
              view of what was asked for and what came back. The worst outcome is a citation issued
              on a finding where the provider had already sent evidence that nobody read.
            </p>
            <p className="mt-2">
              This prototype makes every inspection one case record, and enforces a single rule at
              its centre: <strong>a citation cannot be finalized while provider evidence attached to
              that finding is still unreviewed.</strong> Overriding that requires a written
              justification and is recorded permanently.
            </p>
            <p className="mt-2">
              The software makes no regulatory decisions. It never decides whether a violation
              occurred, whether a matter qualifies for consultation, or whether evidence proves
              compliance. It surfaces deadlines and guidance; a person decides.
            </p>
          </section>

          <section id="regulations">
            <h2 className="text-base font-semibold">Regulatory references</h2>
            <p className="mt-2">
              Modelled on chapter 70.128 RCW and chapter 388-76 WAC — notably RCW 70.128.070
              (inspections), RCW 70.128.090 (inspection reports), WAC 388-76-10920
              (inspection/investigation reports), WAC 388-76-10930 (plan/attestation of correction),
              and WAC 388-76-10990 with RCW 70.128.167 (informal dispute resolution).
            </p>
            <p className="mt-2">
              Any regulation summaries shown in the application are working text for the
              demonstration. The authoritative source is the published Washington Administrative Code
              and Revised Code of Washington. Deadline intervals shown are placeholders and are not a
              statement of what the law requires.
            </p>
          </section>

          <section id="privacy">
            <h2 className="text-base font-semibold">Notice of privacy practices</h2>
            <p className="mt-2">
              Every home, person, licence number and case in this system is fictional. No real
              resident information is held here, and none should be entered.
            </p>
            <p className="mt-2">
              The data model deliberately minimises resident information: findings reference a
              redacted identifier such as &ldquo;Resident A&rdquo; rather than a name, and no resident
              name, date of birth or identifier is stored anywhere.
            </p>
          </section>

          <section id="security">
            <h2 className="text-base font-semibold">Security notice</h2>
            <p className="mt-2">
              This prototype has not completed a Washington State security review, a penetration
              test, or any formal assessment. It must not hold real information.
            </p>
            <p className="mt-2">
              What is implemented: role-based access control with facility-level isolation, an
              append-only audit trail, private document storage reached only through an
              authorization-checked route, hashed passwords and session tokens, rate-limited sign-in,
              and standard web hardening. What is not: malware scanning, multi-factor authentication,
              a retention policy, and independent assessment.
            </p>
          </section>

          <section id="accessibility">
            <h2 className="text-base font-semibold">Accessibility</h2>
            <p className="mt-2">
              Built targeting WCAG 2.1 AA: semantic landmarks and headings, labelled controls,
              visible focus, results announced in live regions, real table semantics with scoped
              headers, and status conveyed by icon and text as well as colour, so nothing depends on
              colour alone.
            </p>
            <p className="mt-2">
              It has <strong>not</strong> been through a formal accessibility audit with assistive
              technology. If something here is unusable for you, that is a defect worth reporting.
            </p>
          </section>

          <section id="nondiscrimination">
            <h2 className="text-base font-semibold">Nondiscrimination</h2>
            <p className="mt-2">
              This is a demonstration system operating no programme and serving no public. It makes
              no eligibility determinations and provides no benefits or services.
            </p>
          </section>

          <p>
            <Link href="/">Return to sign in</Link>
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
