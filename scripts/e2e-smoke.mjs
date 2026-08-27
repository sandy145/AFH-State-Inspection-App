/**
 * End-to-end smoke test through a real browser.
 *
 * Drives the paths that matter most and that unit tests cannot reach: a provider
 * actually uploading a file through the form, the receipt that follows, an
 * inspector reviewing it, and the citation guard refusing to finalize while
 * evidence is unreviewed.
 *
 *   npm run build && npm start &
 *   node scripts/e2e-smoke.mjs
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_PASSWORD ?? "AfhPortal!Dev2026";

const pinned = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(pinned) ? { executablePath: pinned } : {});

const failures = [];
const checks = [];

function check(name, condition, detail = "") {
  if (condition) {
    checks.push(name);
    console.info(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login")),
    page.click("button[type=submit]"),
  ]);
}

// A tiny but structurally valid PDF, so the upload path sees a real file.
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8",
);

console.info("\nSign-in and role routing");
{
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE}/login`);
  await page.fill("#email", "provider@example.com");
  await page.fill("#password", "wrong-password");
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Sign-in failed");
  const message = await page.textContent("[role=alert]");
  check(
    "a wrong password gives a message that reveals nothing about the account",
    /incorrect/i.test(message ?? "") && !/unknown|no such|inactive/i.test(message ?? ""),
    message ?? "",
  );

  await signIn(page, "provider@example.com");
  check("a provider lands on the provider dashboard", page.url().endsWith("/provider"), page.url());
  await context.close();
}

console.info("\nProvider uploads evidence and receives a receipt");
let submissionReference = null;
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, "provider@example.com");

  await page.goto(`${BASE}/provider/requests`, { waitUntil: "networkidle" });
  await page.click("text=Caregiver training certificates");
  await page.waitForSelector("#files");

  await page.setInputFiles("#files", {
    name: "TrainingCertificate.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await page.fill("#providerExplanation", "Certificate attached; completion date is on page 1.");

  await Promise.all([
    page.waitForURL(/\/receipts\//),
    page.click("button:has-text('Submit evidence')"),
  ]);

  const body = await page.textContent("body");
  check("the upload produces a receipt page", /Evidence Submission Receipt/.test(body ?? ""));
  check("the receipt names the file", /TrainingCertificate\.pdf/.test(body ?? ""));
  check("the receipt carries a submission id", /EV-[0-9A-F]{7}/.test(body ?? ""));
  check("the receipt carries a receipt number", /RCPT-[0-9A-F]{9}/.test(body ?? ""));
  check("the receipt names the case", /AFH-2026-001284/.test(body ?? ""));

  submissionReference = (body ?? "").match(/EV-[0-9A-F]{7}/)?.[0] ?? null;
  await context.close();
}

console.info("\nThe submission reaches the inspector's queue");
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, "inspector@example.com");

  await page.goto(`${BASE}/inspector/review`, { waitUntil: "networkidle" });
  const body = await page.textContent("body");
  check(
    "the new submission appears in the review queue awaiting review",
    submissionReference !== null && body?.includes(submissionReference) && /Needs review/.test(body ?? ""),
    submissionReference ?? "no reference captured",
  );

  // The reference is plain text in the queue; the link is the row's Review button.
  await page.locator("tr", { hasText: submissionReference }).getByRole("link", { name: "Review" }).click();
  await page.waitForSelector("text=REVIEW REQUIRED");
  const detail = await page.textContent("body");
  check("the reviewer sees the unreviewed-evidence banner", /PROVIDER EVIDENCE SUBMITTED/.test(detail ?? ""));
  check("the request and the provider explanation are shown side by side", /completion date is on page 1/.test(detail ?? ""));

  // Record a determination and confirm it sticks.
  await page.selectOption("#outcome", "ACCEPTED");
  await page.click("button:has-text('Record determination')");
  await page.waitForSelector("text=Determination recorded");
  check("a determination can be recorded", true);
  await context.close();
}

console.info("\nThe citation guard blocks finalization");
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, "inspector2@example.com");

  await page.goto(`${BASE}/inspections?q=AFH-2026-001290`, { waitUntil: "networkidle" });
  await page.click("text=AFH-2026-001290");
  await page.click("text=Medication administration record");
  await page.waitForSelector("text=PROVIDER EVIDENCE SUBMITTED");

  const body = await page.textContent("body");
  check("the finding shows the guard banner", /PROVIDER EVIDENCE SUBMITTED — REVIEW REQUIRED/.test(body ?? ""));
  check("finalization is reported as blocked", /Finalization blocked/.test(body ?? ""));
  check("the unreviewed submission is named", /EV-3F71D08/.test(body ?? ""));

  const finalize = page.locator("button:has-text('Finalize citation')");
  check("the finalize control is disabled", await finalize.isDisabled());
  check(
    "the reason is stated in text, not only by the disabled state",
    /Review every submission on this finding/.test(body ?? ""),
  );

  // The override path exists but demands a written justification.
  await page.click("text=Finalize anyway using an authorized override");
  await page.waitForSelector("#overrideJustification");
  check("choosing to override reveals a required justification field", true);
  await context.close();
}

console.info("\nTenant isolation over HTTP");
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, "provider@example.com");

  const response = await page.goto(`${BASE}/inspections`, { waitUntil: "networkidle" });
  check("a provider cannot reach the staff inspection list", (response?.status() ?? 0) >= 400 || !page.url().endsWith("/inspections"), String(response?.status()));

  const body = await page.textContent("body");
  check("no other home's case number is visible to this provider", !/AFH-2026-001290|AFH-2026-001255/.test(body ?? ""));
  await context.close();
}

await browser.close();

console.info(`\n${checks.length} checks passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
