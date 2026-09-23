#!/usr/bin/env node
// L13 — the browser half of the dress rehearsal. Called by `scripts/auth_rehearsal.sh`.
//
//   node scripts/auth_rehearsal_browser.mjs register  --base http://localhost:8264 --user Roli --password … --out cred.json
//   node scripts/auth_rehearsal_browser.mjs login     --base http://localhost:8264 --in cred.json --user Roli
//   node scripts/auth_rehearsal_browser.mjs deeplinks --base http://localhost:8264 --user Roli --password … --tournament 19 --comment 7
//
// `register` signs in with the password through the real login screen, adds a passkey on
// Settings → Account with CDP's virtual authenticator, and writes the credential — private key
// included — to a file. `login` starts a *fresh* browser, loads that credential into a new
// virtual authenticator, and signs in with "Use a passkey" and nothing typed: the same
// credential, across whatever happened to the backend in between (the rollback and forward).
// `deeplinks` opens the links old pushes, home-screen icons and chat messages carry.
//
// WebAuthn needs a secure context, so the base must be `localhost`, not an IP; the backend
// must run with AUTH_DEV_ORIGIN=1. Playwright: `PLAYWRIGHT=/path/to/playwright-core`.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");

const mode = process.argv[2];
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const BASE = arg("base", "http://localhost:8264");
const APP = `${BASE}/g/altherren`;
let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}
const me = (page) =>
  page.evaluate(async () => {
    const r = await fetch("/api/me");
    return { status: r.status, body: r.status === 200 ? await r.json() : null };
  });
async function authenticator(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}
async function fillLogin(page, user, password) {
  await page.getByLabel("Name").fill(user);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^log in$/i }).click();
}
async function passwordLogin(page, user, password) {
  await page.goto(`${APP}/login`);
  await fillLogin(page, user, password);
  await page.waitForURL(/\/dashboard/);
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const USER = arg("user", "Roli");

  if (mode === "register") {
    const { cdp, authenticatorId } = await authenticator(context, page);
    await passwordLogin(page, USER, arg("password"));
    check(`register: password login as ${USER} through the login screen`, (await me(page)).status === 200);
    await page.goto(`${APP}/settings?tab=account`);
    await page.getByText("No passkeys yet.").waitFor();
    await page.getByRole("button", { name: "Add a passkey" }).click();
    await page.getByText(/Passkey added/).waitFor();
    const m = await me(page);
    check("register: /me has_passkey", m.body && m.body.has_passkey === true);
    const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    check("register: one resident credential in the authenticator", credentials.length === 1 && credentials[0].isResidentCredential);
    writeFileSync(arg("out"), JSON.stringify(credentials));
  } else if (mode === "login") {
    const { cdp, authenticatorId } = await authenticator(context, page);
    const credentials = JSON.parse(readFileSync(arg("in"), "utf8"));
    for (const c of credentials) await cdp.send("WebAuthn.addCredential", { authenticatorId, credential: c });
    await page.goto(`${APP}/login`);
    check("passkey login: logged out to begin with", (await me(page)).status === 401);
    await page.getByRole("button", { name: "Use a passkey" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    const m = await me(page);
    check(`passkey login: signed in as ${USER} with nothing typed, in a fresh browser`, m.status === 200 && m.body.player_name === USER, m.body && m.body.player_name);
  } else if (mode === "deeplinks") {
    const tid = arg("tournament");
    const cid = arg("comment");
    // logged out first: an old link lands on the group's login screen
    await page.goto(`${BASE}/live/${tid}?comment=${cid}`);
    await page.waitForURL(/\/g\/altherren\/login/, { timeout: 15000 }).catch(() => {});
    check("deep link, logged out: /live/<id>?comment=<id> → the group's login screen", page.url().startsWith(`${APP}/login`), page.url().slice(BASE.length));
    // logging in from there returns to the link that was opened, not to the dashboard
    await fillLogin(page, USER, arg("password"));
    await page.waitForURL(new RegExp(`/g/altherren/live/${tid}`), { timeout: 15000 }).catch(() => {});
    check("deep link, logged out: after the login, back on the tournament it pointed at", new RegExp(`^/g/altherren/live/${tid}`).test(page.url().slice(BASE.length)), page.url().slice(BASE.length));
    const links = [
      [`/live/${tid}?comment=${cid}`, new RegExp(`^/g/altherren/live/${tid}`)],
      ["/stats?view=h2h", /^\/g\/altherren\/stats\?view=h2h/],
      ["/profiles/3", /^\/g\/altherren\/profiles\/3/],
      ["/ideas?idea=1", /^\/g\/altherren\/ideas/],
      ["/dashboard", /^\/g\/altherren\/dashboard/],
      ["/", /^\/g\/altherren\/dashboard/],
    ];
    for (const [from, want] of links) {
      await page.goto(`${BASE}${from}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
      const got = page.url().slice(BASE.length);
      check(`deep link ${from} → ${got}`, want.test(got));
    }
  } else {
    throw new Error(`unknown mode ${mode}`);
  }
  await context.close();
} catch (e) {
  failed += 1;
  console.log(`FAIL (threw) ${e && e.message}`);
} finally {
  await browser.close();
}
process.exit(failed === 0 ? 0 : 1);
