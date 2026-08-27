import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { currentUser } from "@/lib/session";
import { homePathForRole } from "@/domain/authz";
import { env } from "@/lib/env";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Sign in" };

/** Shown only outside production, so nobody has to hunt through the seed file. */
const DEMO_ACCOUNTS = [
  { email: "inspector@example.com", role: "Inspector — Jane Doe" },
  { email: "manager@example.com", role: "Field Manager — John Smith" },
  { email: "provider@example.com", role: "Provider — Sunrise AFH" },
  { email: "admin@example.com", role: "RCS Administrator" },
];

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(homePathForRole(user.role));

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-12">
      <div className="grid w-full gap-10 lg:grid-cols-2">
        <div className="flex flex-col justify-center">
          <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            Prototype modelled on Washington State DSHS / RCS process
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">AFH Compliance Portal</h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            Residential Care Services — Adult Family Home inspections. One case record for every
            finding, every request for evidence, every document submitted, and every decision made.
          </p>

          <div className="mt-8 rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Unofficial prototype — not a Washington State system</p>
            <p className="mt-1">
              This is an independent demonstration built to explore how the inspection and evidence
              process could work. It is <strong>not affiliated with, operated by, or endorsed by</strong>{" "}
              DSHS or Residential Care Services, it is not an authoritative licensing record, and it
              has not completed any state security or accessibility review.
            </p>
            <p className="mt-2">
              Every home, person and case in it is fictional. Do not enter real resident information,
              real licence numbers, or anything you would not want to be public.
            </p>
          </div>
        </div>

        <Card className="self-center">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
              <LoginForm />
            </Suspense>

            {env.showDemoCredentials ? (
              <div className="rounded-md border bg-muted/40 p-4 text-sm">
                <p className="font-medium">Demo accounts</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fictional accounts holding fictional data. Password for all accounts:{" "}
                  <code className="rounded bg-background px-1 py-0.5">{env.demoPassword}</code>
                </p>
                <ul className="mt-3 space-y-1">
                  {DEMO_ACCOUNTS.map((account) => (
                    <li key={account.email} className="flex flex-wrap justify-between gap-2">
                      <code className="text-xs">{account.email}</code>
                      <span className="text-xs text-muted-foreground">{account.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
