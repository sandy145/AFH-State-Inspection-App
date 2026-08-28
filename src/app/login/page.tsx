import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { homePathForRole } from "@/domain/authz";
import { env } from "@/lib/env";
import { LoginForm } from "./login-form";
import { FieldGroup } from "@/components/ui/card";
import { AdministrationBand, Breadcrumb, SiteBanner, SiteFooter } from "@/components/site-chrome";

export const metadata = { title: "Sign in" };

const DEMO_ACCOUNTS = [
  { email: "inspector@example.com", role: "Inspector — Jane Doe" },
  { email: "manager@example.com", role: "Field Manager — John Smith" },
  { email: "provider@example.com", role: "Provider — Sunrise AFH" },
  { email: "admin@example.com", role: "RCS Administrator" },
];

/**
 * Sign in.
 *
 * Chrome follows the DSHS / ALTSA visual language — navy agency band, ochre
 * administration band, breadcrumb strip, charcoal footer. The banner carries
 * this application's own name rather than the department's: the look is
 * borrowed, the identity is not, and the notice below says so before anyone
 * types a password.
 */
export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(homePathForRole(user.role));

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteBanner />
      <AdministrationBand />
      <Breadcrumb trail={[{ label: "Home" }, { label: "Sign in" }]} />

      <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8">
        <h1 className="text-[1.75rem] font-normal leading-tight text-primary">
          Adult Family Home Compliance Portal
        </h1>

        <div className="mt-4 grid max-w-6xl gap-8 lg:grid-cols-[1.15fr_1fr]">
          <div className="space-y-4 text-[0.95rem] leading-relaxed">
            <p>
              Residential Care Services inspections of Adult Family Homes. One case record for every
              finding, every request for evidence, every document submitted, and every decision made.
            </p>
            <p>
              Providers sign in to see what the State has asked for, when it is due, and what was
              decided. Inspectors and Field Managers sign in to request evidence, review what
              arrives, and record outcomes.
            </p>

            <div className="border-l-4 border-administration bg-administration/10 p-4">
              <p className="font-semibold">Unofficial prototype — not a Washington State system</p>
              <p className="mt-1">
                An independent demonstration built to explore how the inspection and evidence process
                could work. It is <strong>not affiliated with, operated by, or endorsed by</strong>{" "}
                DSHS or Residential Care Services, it is not an authoritative licensing record, and
                it has not completed any state security or accessibility review.
              </p>
              <p className="mt-2">
                Every home, person and case in it is fictional. Do not enter real resident
                information, real licence numbers, or anything you would not want to be public.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <FieldGroup legend="Sign in">
              <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
                <LoginForm />
              </Suspense>
            </FieldGroup>

            {env.showDemoCredentials ? (
              <FieldGroup legend="Demo accounts">
                <p className="text-sm text-muted-foreground">
                  Fictional accounts holding fictional data. Password for all accounts:{" "}
                  <code className="bg-secondary px-1 py-0.5 font-mono text-[0.8rem]">
                    {env.demoPassword}
                  </code>
                </p>
                <table className="mt-3 w-full text-sm">
                  <caption className="sr-only">Demonstration accounts and their roles</caption>
                  <tbody>
                    {DEMO_ACCOUNTS.map((account) => (
                      <tr key={account.email} className="border-b border-border last:border-0">
                        <td className="py-1.5 font-mono text-[0.8rem]">{account.email}</td>
                        <td className="py-1.5 text-right text-muted-foreground">{account.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </FieldGroup>
            ) : null}
          </div>
        </div>
      </main>

      <SiteFooter compact />
    </div>
  );
}
