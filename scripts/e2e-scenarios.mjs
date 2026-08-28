/**
 * End-to-end scenario suite, driven through a real browser.
 *
 * Covers the paths that unit and integration tests cannot reach: real form
 * posts, real file uploads, real redirects, and the rendered state a person
 * actually sees. Every scenario is isolated — a failure is recorded and the run
 * continues, so one broken step does not hide the rest.
 *
 *   npm run build && npm start &
 *   node scripts/e2e-scenarios.mjs
 *
 * It writes real data — uploads, determinations, resolutions — so it is safe to
 * run repeatedly but is not read-only. Point it at a demo instance, never at
 * anything whose contents matter.
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_PASSWORD ?? "AfhPortal!Dev2026";
const pinned = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

const browser = await chromium.launch(existsSync(pinned) ? { executablePath: pinned } : {});

const results = [];
let currentScenario = "";

function check(name, condition, detail = "") {
  results.push({ scenario: currentScenario, name, ok: Boolean(condition), detail });
  console.info(`  ${condition ? "PASS" : "FAIL"}  ${name}${condition || !detail ? "" : ` — ${detail}`}`);
}

async function scenario(title, fn) {
  currentScenario = title;
  console.info(`\n${title}`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await fn(page, context);
  } catch (error) {
    check("scenario ran to completion", false, String(error).split("\n")[0].slice(0, 160));
  } finally {
    await context.close();
  }
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 }),
    page.click("button[type=submit]"),
  ]);
}

/**
 * Opens a case from the inspection list by clicking its link.
 *
 * Clicking bare text can match a non-link element and quietly fail to navigate,
 * which once made every "tab" assertion run against the list page instead.
 */
async function openCase(page, caseNumber) {
  await page.goto(`${BASE}/inspections?q=${caseNumber}`, { waitUntil: "domcontentloaded" });
  await Promise.all([
    page.waitForURL(/\/inspections\/[0-9a-f-]{36}/, { timeout: 30000 }),
    page.getByRole("link", { name: caseNumber }).first().click(),
  ]);
}

function pdf(sizeBytes = 0) {
  const head = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n");
  const tail = Buffer.from("\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const padding = Math.max(0, sizeBytes - head.length - tail.length);
  return Buffer.concat([head, Buffer.alloc(padding, 0x20), tail]);
}

// ---------------------------------------------------------------------------

await scenario("Authentication and role routing", async (page) => {
  // A throwaway address, so a deliberate failure here never locks out a demo
  // account that later scenarios need.
  await page.goto(`${BASE}/login`);
  await page.fill("#email", `nobody-${Date.now()}@example.com`);
  await page.fill("#password", "definitely-the-wrong-password");
  await page.click("button[type=submit]");
  // Read the alert that actually carries text: Next.js renders its own empty
  // route-announcer with role="alert", and selecting the first match finds that.
  await page.getByRole("alert").filter({ hasText: /./ }).first().waitFor({ timeout: 20000 });
  const message = (await page.getByRole("alert").filter({ hasText: /./ }).first().textContent()) ?? "";
  check(
    "a failed sign-in reveals nothing about the account",
    /incorrect|too many/i.test(message) && !/unknown|no such|inactive|not found/i.test(message),
    message.replace(/\s+/g, " ").trim().slice(0, 80),
  );
  check("the failure is announced, not silent", message.trim().length > 0);

  // A fresh context per account: an already-signed-in visitor is redirected away
  // from /login, which is correct behaviour and would break a shared session.
  for (const [email, path] of [
    ["provider@example.com", "/provider"],
    ["inspector@example.com", "/inspector"],
    ["manager@example.com", "/manager"],
    ["admin@example.com", "/admin"],
  ]) {
    const context = await browser.newContext();
    const fresh = await context.newPage();
    await signIn(fresh, email);
    check(`${email.split("@")[0]} lands on ${path}`, new URL(fresh.url()).pathname === path, fresh.url());
    await context.close();
  }

  // And that redirect is worth asserting rather than merely working around.
  const signedIn = await browser.newContext();
  const signedInPage = await signedIn.newPage();
  await signIn(signedInPage, "provider@example.com");
  await signedInPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  check(
    "a signed-in visitor is redirected away from the login page",
    new URL(signedInPage.url()).pathname === "/provider",
    signedInPage.url(),
  );
  await signedIn.close();
});

await scenario("Provider uploads evidence and gets a receipt", async (page) => {
  await signIn(page, "provider@example.com");
  await page.goto(`${BASE}/provider/requests`, { waitUntil: "domcontentloaded" });
  await page.click("text=Caregiver training certificates");
  await page.waitForSelector("#files");

  // Deliberately larger than Next's 1 MB server-action default, which once
  // rejected ordinary documents with a generic error.
  await page.setInputFiles("#files", {
    name: "TrainingCertificate.pdf",
    mimeType: "application/pdf",
    buffer: pdf(2 * 1024 * 1024),
  });
  await page.fill("#providerExplanation", "Completion date is on page 1.");
  await Promise.all([
    page.waitForURL(/\/receipts\//, { timeout: 60000 }),
    page.click("button:has-text('Submit evidence')"),
  ]);

  const body = (await page.textContent("body")) ?? "";
  check("a 2 MB upload succeeds", /Evidence Submission Receipt/.test(body));
  check("the receipt names the file", /TrainingCertificate\.pdf/.test(body));
  check("the receipt carries a submission id", /EV-[0-9A-F]{7}/.test(body));
  check("the receipt carries a receipt number", /RCPT-[0-9A-F]{9}/.test(body));
  check("the receipt names the case", /AFH-2026-001284/.test(body));
});

await scenario("An oversized file is refused in words, not a generic error", async (page) => {
  await signIn(page, "provider@example.com");
  await page.goto(`${BASE}/provider/requests`, { waitUntil: "domcontentloaded" });
  await page.click("text=Caregiver training certificates");
  await page.waitForSelector("#files");

  const hint = (await page.textContent("body")) ?? "";
  const stated = hint.match(/Up to ([\d.]+) MB per submission/);
  check("the form states the size limit", Boolean(stated), stated?.[0] ?? "no limit shown");

  // Over the stated limit. A body this size is aborted mid-stream by the
  // runtime, so the server action never runs and cannot report anything — the
  // check has to happen in the browser or the upload dies in silence.
  const limitBytes = Number(stated?.[1] ?? 25) * 1024 * 1024;
  await page.setInputFiles("#files", {
    name: "Enormous.pdf",
    mimeType: "application/pdf",
    buffer: pdf(Math.round(limitBytes * 1.05)),
  });

  await page.waitForSelector("[role=alert]", { timeout: 20000 }).catch(() => {});
  const body = (await page.textContent("body")) ?? "";

  check("the file is refused before anything is uploaded", /too large/i.test(body));
  check("the message names the file", /Enormous\.pdf/.test(body));
  check("the message states the limit", new RegExp(`${stated?.[1] ?? 25} MB`).test(body));
  check(
    "submitting is prevented while the file is attached",
    await page.locator("button:has-text('Submit evidence')").isDisabled(),
  );
  check("it says what to do instead", /smaller scan|separate submissions/i.test(body));
});

await scenario("Inspector reviews the submission", async (page, context) => {
  // Submit something first, so this scenario owns the row it reviews rather
  // than depending on what ran before it.
  const provider = await context.browser().newContext();
  const providerPage = await provider.newPage();
  await signIn(providerPage, "provider@example.com");
  await providerPage.goto(`${BASE}/provider/requests`, { waitUntil: "domcontentloaded" });
  await providerPage.click("text=Caregiver training certificates");
  await providerPage.waitForSelector("#files");
  await providerPage.setInputFiles("#files", {
    name: "ReviewFixture.pdf",
    mimeType: "application/pdf",
    buffer: pdf(4096),
  });
  await Promise.all([
    providerPage.waitForURL(/\/receipts\//, { timeout: 60000 }),
    providerPage.click("button:has-text('Submit evidence')"),
  ]);
  const receipt = (await providerPage.textContent("body")) ?? "";
  const reference = (receipt.match(/EV-[0-9A-F]{7}/) ?? [])[0];
  await provider.close();
  check("the fixture submission has a reference", Boolean(reference), reference ?? "none");

  await signIn(page, "inspector@example.com");
  await page.goto(`${BASE}/inspector/review`, { waitUntil: "domcontentloaded" });

  const queue = (await page.textContent("body")) ?? "";
  check("the new submission is in the queue", reference ? queue.includes(reference) : false, reference ?? "none");

  // Click the row for this run's own submission, not whichever happens to be first.
  await Promise.all([
    page.waitForURL(/\/inspector\/review\/[0-9a-f-]{36}/, { timeout: 30000 }),
    page.locator("tr", { hasText: reference }).first().getByRole("link", { name: /Review|Open/ }).click(),
  ]);
  await page.waitForSelector("text=REVIEW REQUIRED", { timeout: 30000 });

  const detail = (await page.textContent("body")) ?? "";
  check("the unreviewed banner is shown", /PROVIDER EVIDENCE SUBMITTED/.test(detail));
  check("the request appears beside what arrived", /Evidence request/.test(detail));

  // A determination other than acceptance must carry a reason.
  await page.selectOption("#outcome", "INSUFFICIENT");
  await page.click("button:has-text('Record determination')");
  await page.waitForTimeout(2500);
  const afterBlank = (await page.textContent("body")) ?? "";
  check(
    "a non-acceptance without a reason is refused",
    /documented reason|required/i.test(afterBlank),
  );

  await page.fill("#reason", "The certificate is dated after the first date of resident care.");
  await page.click("button:has-text('Record determination')");
  await page.waitForSelector("text=Determination recorded", { timeout: 30000 });
  check("a determination with a reason is recorded", true);
});

await scenario("The citation guard blocks and explains", async (page) => {
  await signIn(page, "inspector2@example.com");
  await openCase(page, "AFH-2026-001290");
  await page.click("text=Medication administration record");
  await page.waitForSelector("text=PROVIDER EVIDENCE SUBMITTED", { timeout: 30000 });

  const body = (await page.textContent("body")) ?? "";
  check("the guard banner is shown", /PROVIDER EVIDENCE SUBMITTED — REVIEW REQUIRED/.test(body));
  check("finalization is reported as blocked", /Finalization blocked/.test(body));
  check("the unreviewed submission is named", /EV-3F71D08/.test(body));
  check("the evidence summary counts what is outstanding", /remain unreviewed/.test(body));

  const finalize = page.locator("button:has-text('Finalize citation')");
  check("the finalize control is disabled", await finalize.isDisabled());
  check("the reason is text, not just a disabled state", /Review every submission on this finding/.test(body));

  await page.click("text=Finalize anyway using an authorized override");
  await page.waitForSelector("#overrideJustification", { timeout: 15000 });
  check("an override reveals a required justification", true);

  // A token justification must not be enough.
  await page.fill("#overrideJustification", "fine");
  await page.click("button:has-text('Finalize with override')");
  await page.waitForTimeout(2500);
  const afterShort = (await page.textContent("body")) ?? "";
  check("a token justification is refused", /at least 20 characters|Not saved/i.test(afterShort));
});

await scenario("Inspector resolves a finding as no violation", async (page) => {
  await signIn(page, "inspector@example.com");
  await openCase(page, "AFH-2026-001284");
  await page.click("text=Caregiver training documentation");
  await page.waitForSelector("h1, [class*=CardTitle], text=Finding", { timeout: 30000 }).catch(() => {});

  // This suite mutates data, so a finding may already be resolved from an
  // earlier run. Both states are legitimate; assert whichever applies rather
  // than depending on a freshly seeded database.
  const resolveButton = page.locator("button:has-text('Resolve — no violation')");

  if ((await resolveButton.count()) > 0) {
    await page.fill("#note", "Certificates supplied show training completed before the first shift.");
    await resolveButton.click();
    await page.waitForTimeout(4000);
    const after = (await page.textContent("body")) ?? "";
    check("resolving records the outcome", /no violation/i.test(after));
    check("the basis is kept on the record", /training completed before the first shift/i.test(after));
  } else {
    const body = (await page.textContent("body")) ?? "";
    check("an already-resolved finding shows its outcome", /Resolved — no violation|no violation/i.test(body));
    check("the resolve control is gone once resolved", true);
  }
});

await scenario("Field Manager sees oversight metrics", async (page) => {
  await signIn(page, "manager@example.com");
  const body = (await page.textContent("body")) ?? "";

  check("Evidence Review Integrity is shown", /Evidence Review Integrity/.test(body));
  check("its target is stated as zero", /Target: zero/.test(body));
  check("ageing evidence has its own section", /Ageing evidence/.test(body));
  check("case load is labelled as workload, not performance", /Not a performance measure/.test(body));

  await page.goto(`${BASE}/manager/reports`, { waitUntil: "domcontentloaded" });
  const reports = (await page.textContent("body")) ?? "";
  check("reports disclaim performance scoring", /not performance scores/i.test(reports));
  check("findings by regulation are reported", /Findings by regulation/.test(reports));
});

await scenario("Administration and audit", async (page) => {
  await signIn(page, "admin@example.com");

  await page.goto(`${BASE}/admin/deadlines`, { waitUntil: "domcontentloaded" });
  const deadlines = (await page.textContent("body")) ?? "";
  check("deadline rules are editable configuration", /Attestation of Correction due/.test(deadlines));
  check("shipped values are marked as placeholders", /placeholders/i.test(deadlines));
  check("the holiday calendar is shown", /Holiday calendar/.test(deadlines));

  await page.goto(`${BASE}/admin/audit`, { waitUntil: "domcontentloaded" });
  const audit = (await page.textContent("body")) ?? "";
  check("the audit log is readable", /Audit log/.test(audit));
  check("it states records cannot be edited", /cannot be edited or deleted/i.test(audit));
  check("recent activity is present", /evidence uploaded|user signed in|evidence reviewed/i.test(audit));

  await page.goto(`${BASE}/admin/facilities`, { waitUntil: "domcontentloaded" });
  const facilities = (await page.textContent("body")) ?? "";
  check("it says this is not the licensing system of record", /not the licensing system of record/i.test(facilities));
});

await scenario("Tenant isolation holds over HTTP", async (page) => {
  await signIn(page, "provider@example.com");

  const staff = await page.goto(`${BASE}/inspections`, { waitUntil: "domcontentloaded" });
  check(
    "a provider cannot reach the staff inspection list",
    (staff?.status() ?? 0) >= 400 || !page.url().endsWith("/inspections"),
    `status ${staff?.status()} at ${page.url()}`,
  );

  const admin = await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
  check(
    "a provider cannot reach administration",
    (admin?.status() ?? 0) >= 400 || !page.url().includes("/admin"),
    `status ${admin?.status()} at ${page.url()}`,
  );

  await page.goto(`${BASE}/provider/findings`, { waitUntil: "domcontentloaded" });
  const body = (await page.textContent("body")) ?? "";
  check("no other home's case is visible", !/AFH-2026-001290|AFH-2026-001255/.test(body));

  const review = await page.goto(`${BASE}/inspector/review`, { waitUntil: "domcontentloaded" });
  check(
    "a provider cannot reach the review queue",
    (review?.status() ?? 0) >= 400 || !page.url().includes("/inspector"),
    `status ${review?.status()} at ${page.url()}`,
  );
});

await scenario("Case record tabs render", async (page) => {
  await signIn(page, "inspector@example.com");
  await openCase(page, "AFH-2026-001284");
  const caseUrl = page.url();
  check("the case page opened", /\/inspections\/[0-9a-f-]{36}$/.test(new URL(caseUrl).pathname), caseUrl);

  for (const [tab, marker] of [
    ["timeline", /Inspection started|Provider uploaded/i],
    ["audit", /cannot be edited or deleted/i],
    ["evidence", /Evidence requests on this inspection|Request/i],
    ["documents", /Documents on this inspection|Download|No documents/i],
    ["findings", /Findings on this inspection|Document a new finding/i],
    ["corrections", /Corrections|No corrections/i],
    ["idr", /dispute|IDR|No disputes/i],
    ["follow-up", /follow-up/i],
  ]) {
    const response = await page.goto(`${caseUrl}/${tab}`, { waitUntil: "domcontentloaded" });
    const body = (await page.textContent("body")) ?? "";
    check(`${tab} tab renders`, (response?.status() ?? 500) < 400 && marker.test(body), `status ${response?.status()}`);
  }
});

await scenario("Provider self-service pages render", async (page) => {
  await signIn(page, "provider@example.com");

  for (const [path, marker] of [
    ["/provider", /Evidence requests|Action required|Nothing is outstanding/i],
    ["/provider/requests", /Evidence requests/i],
    ["/provider/findings", /Findings/i],
    ["/provider/corrections", /Corrections|No corrections are due/i],
    ["/provider/documents", /Documents/i],
    ["/notifications", /Notifications/i],
  ]) {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    const body = (await page.textContent("body")) ?? "";
    check(`${path} renders`, (response?.status() ?? 500) < 400 && marker.test(body), `status ${response?.status()}`);
  }
});

await scenario("Accessibility basics on the pages people live in", async (page) => {
  await signIn(page, "inspector@example.com");

  for (const path of ["/inspector", "/inspector/review"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });

    const landmarks = await page.evaluate(() => ({
      main: document.querySelectorAll("main").length,
      h1: document.querySelectorAll("h1").length,
      skipLink: Boolean(document.querySelector("a.skip-link")),
      tablesWithCaption: [...document.querySelectorAll("table")].every((t) => t.querySelector("caption")),
      inputsLabelled: [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].every(
        (el) =>
          el.hasAttribute("aria-label") ||
          el.hasAttribute("aria-labelledby") ||
          Boolean(el.id && document.querySelector(`label[for="${el.id}"]`)),
      ),
    }));

    check(`${path} has one main landmark`, landmarks.main === 1, String(landmarks.main));
    check(`${path} has exactly one h1`, landmarks.h1 === 1, String(landmarks.h1));
    check(`${path} offers a skip link`, landmarks.skipLink);
    check(`${path} captions every table`, landmarks.tablesWithCaption);
    check(`${path} labels every control`, landmarks.inputsLabelled);
  }
});

// ---------------------------------------------------------------------------

await browser.close();

const failed = results.filter((r) => !r.ok);
const byScenario = [...new Set(results.map((r) => r.scenario))];

console.info(`\n${"=".repeat(70)}`);
console.info(`${results.length - failed.length}/${results.length} checks passed across ${byScenario.length} scenarios.`);

if (failed.length > 0) {
  console.error(`\n${failed.length} failing:`);
  for (const f of failed) console.error(`  [${f.scenario}] ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  process.exit(1);
}
