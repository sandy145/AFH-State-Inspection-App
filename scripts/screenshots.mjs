/**
 * Captures the screenshots in docs/screenshots.
 *
 * Run against a seeded local instance:
 *   npm run build && npm start &
 *   node scripts/screenshots.mjs
 *
 * It signs in as each demo account through the real login form, so what is
 * captured is what a user actually sees — not a mock.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_PASSWORD ?? "AfhPortal!Dev2026";
const OUT = "docs/screenshots";

const SHOTS = [
  { account: null, path: "/login", name: "01-login" },
  { account: "provider@example.com", path: "/provider", name: "02-provider-dashboard" },
  { account: "provider@example.com", path: "/provider/requests", name: "03-provider-evidence-requests" },
  { account: "inspector@example.com", path: "/inspector", name: "04-inspector-dashboard" },
  { account: "inspector@example.com", path: "/inspector/review", name: "05-evidence-review-queue" },
  { account: "manager@example.com", path: "/manager", name: "07-field-manager-dashboard" },
  { account: "manager@example.com", path: "/manager/reports", name: "08-reports" },
  { account: "admin@example.com", path: "/admin/deadlines", name: "09-deadline-configuration" },
  { account: "admin@example.com", path: "/admin/audit", name: "10-audit-log" },
];

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login")),
    page.click("button[type=submit]"),
  ]);
}

// Honour a pinned Chromium when the environment provides one, so this runs
// wherever a browser is already installed rather than downloading another.
const pinned = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch(
  existsSync(pinned) ? { executablePath: pinned } : {},
);
await mkdir(OUT, { recursive: true });

for (const shot of SHOTS) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  if (shot.account) await signIn(page, shot.account);
  await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/${shot.name}.png`, fullPage: true });
  console.info(`captured ${shot.name}`);

  await context.close();
}

// The screen the product exists for: a finding whose evidence is unreviewed,
// with the citation guard blocking finalization. Reached by navigation rather
// than a hard-coded id, so the capture survives a reseed.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();
  await signIn(page, "inspector2@example.com");
  await page.goto(`${BASE}/inspections?q=AFH-2026-001290`, { waitUntil: "networkidle" });
  await page.click("text=AFH-2026-001290");
  await page.click("text=Medication administration record");
  await page.waitForSelector("text=PROVIDER EVIDENCE SUBMITTED");
  await page.screenshot({ path: `${OUT}/06-citation-guard.png`, fullPage: true });
  console.info("captured 06-citation-guard");
  await context.close();
}

await browser.close();
console.info(`Screenshots written to ${OUT}`);
