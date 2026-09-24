#!/usr/bin/env node
// E5 — email and the two new passkey ceremonies, end to end, through the real UI, in Chromium
// with CDP's virtual authenticator. Called by `scripts/auth_rehearsal.sh` (step 3b and step 5);
// it also runs alone against any isolated stack started with MAIL_SINK_DIR (never SMTP).
//
//   node scripts/email_e2e.mjs register --base http://localhost:8286 --sink "$WORK/mail" \
//     --code ABCD-EFGH --name "Passkey Neuling" --out neuling.json
//   node scripts/email_e2e.mjs verify   --base … --sink … --in neuling.json --name "Passkey Neuling" \
//     --email neuling@example.test --email2 neuling.new@example.test
//   node scripts/email_e2e.mjs recover  --base … --sink … --in roli-passkey.json --user Roli \
//     --password … --email roli.new@example.test [--out recovered.json]
//   node scripts/email_e2e.mjs login    --base … --sink … --in neuling.json --name "Passkey Neuling" \
//     [--email neuling.new@example.test]
//
// register — an invite code (from `manage.py invite`), the register page, **Create a passkey**:
//   the dashboard, the strip asking for an email, `/me` with no password; the credential is
//   written to --out (private key included) so a later fresh browser can sign in with it.
// verify   — signs in with that passkey (nothing typed), Settings → Email → the address → the
//   link read out of the sink → opened in a *second, cookie-less* context (Safari on the phone):
//   the page does not confirm on load, **Confirm** does → back in the first context a
//   `visibilitychange` makes the strip go, with no reload. Then **Change email**, the same
//   again for the second address, the row reads verified, and the OLD address got a notice
//   with no link in it.
// recover  — an account that already has a passkey (the credential in --in sits in the first
//   authenticator, as it would on the phone): **Lost your passkey or password?** → the address
//   → the link from the sink → **Set a new login** → **Create a passkey** is refused by that
//   authenticator (it already holds this account's passkey) and the token is NOT spent → the
//   first authenticator is removed and a new one added → **Create a passkey** → in; the account
//   lists two passkeys; a session opened before the recovery is ended.
// login    — a fresh browser, the credential from --in, **Use a passkey**, nothing typed.
//
// WebAuthn needs a secure context, so the base must be `localhost`, not an IP; the backend
// must run with AUTH_DEV_ORIGIN=1 and MAIL_SINK_DIR. Playwright: `PLAYWRIGHT=/path/to/playwright-core`.
// The return refresh (`useRefreshMeOnReturn`) asks `/me` at most once per 2 s in one mount, so
// two returns in one mount are spaced by more than that.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");

const HERE = dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2];
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const BASE = arg("base", "http://localhost:8286");
const APP = `${BASE}/g/altherren`;
const SINK = arg("sink");
const STRIP = "[data-secure-account-notice]";
let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const me = (page) =>
  page.evaluate(async () => {
    const r = await fetch("/api/me");
    return { status: r.status, body: r.status === 200 ? await r.json() : null };
  });
const passkeyCount = (page) =>
  page.evaluate(async () => {
    const r = await fetch("/api/auth/passkeys");
    return r.status === 200 ? (await r.json()).length : -1;
  });
const hide = (link) => String(link).replace(/#\S+/, "#<token>");

/** Every message in the sink as [to, subject, link|"-"], oldest first (`mail_sink_link.py --all`). */
function sink() {
  if (!SINK) throw new Error("--sink is required");
  let out = "";
  try {
    out = execFileSync("python3", [join(HERE, "mail_sink_link.py"), SINK, "--all"], { encoding: "utf8" });
  } catch {
    return []; // exit 1: no message yet
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"));
}
const sentTo = (to) => sink().filter((m) => m[0].toLowerCase() === to.toLowerCase());
/** The newest message to `to` once there are more than `before` of them. */
async function waitForMail(to, before, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const msgs = sentTo(to);
    if (msgs.length > before) return msgs[msgs.length - 1];
    if (Date.now() > until) return null;
    await sleep(200);
  }
}

async function authenticator(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const add = async () =>
    (
      await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      })
    ).authenticatorId;
  return { cdp, authenticatorId: await add(), add };
}
async function loadCredentials(cdp, authenticatorId, file) {
  for (const c of JSON.parse(readFileSync(file, "utf8"))) await cdp.send("WebAuthn.addCredential", { authenticatorId, credential: c });
}
/** Write the credential back after it signed: its counter moved, and the server refuses a copy
 *  whose counter is not greater than the last one it saw ("clone?") — which is the point. */
async function saveBack(cdp, authenticatorId, file) {
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  writeFileSync(file, JSON.stringify(credentials));
}
async function passkeyLogin(page) {
  await page.goto(`${APP}/login`);
  await page.getByRole("button", { name: "Use a passkey" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
}
async function stripText(page) {
  const el = page.locator(STRIP);
  return (await el.count()) ? (await el.first().innerText()).split("\n")[0].trim() : null;
}
/** What `visibilitychange` does when the reader comes back from Safari to the PWA. */
const comeBack = (page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
async function waitFor(fn, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await sleep(200);
  }
}

/** Open a link from the mail in a context with no cookie (the phone's Safari), tap Confirm. */
async function confirmInFreshContext(browser, link, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const posts = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/auth/email/verify")) posts.push(r.url());
  });
  await page.goto(link);
  await page.getByRole("heading", { name: "Confirm your email" }).waitFor();
  check(`${label}: the link opens the confirm page in a cookie-less context, the token stripped from the URL`, !page.url().includes("#"), page.url().slice(BASE.length));
  await page.waitForTimeout(1500);
  check(`${label}: nothing is confirmed on load (no POST in 1.5 s — a mail scanner cannot confirm it)`, posts.length === 0, posts.length);
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.locator("[data-email-verified]").waitFor({ timeout: 10000 });
  check(`${label}: one tap on Confirm → one POST, "Verified"`, posts.length === 1, posts.length);
  await ctx.close();
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  if (mode === "register") {
    const NAME = arg("name");
    const { cdp, authenticatorId } = await authenticator(context, page);
    await page.goto(`${APP}/register`);
    const buttons = await page.getByRole("button").allInnerTexts();
    const pk = buttons.findIndex((t) => t.includes("Create a passkey"));
    const pw = buttons.findIndex((t) => t.includes("Use a password instead"));
    check("register: the passkey comes first, the password second", pk >= 0 && pw > pk, buttons);
    await page.getByLabel("Invite code").fill(arg("code"));
    await page.getByLabel("Display name").fill(NAME);
    await page.getByRole("button", { name: "Create a passkey" }).click();
    await page.waitForURL(/\/g\/altherren\/dashboard/, { timeout: 20000 });
    const m = await me(page);
    const b = m.body || {};
    check(
      `register: ${NAME} is in, with a passkey and no password`,
      m.status === 200 && b.player_name === NAME && b.has_passkey === true && b.has_password === false && b.login_secure === true && b.email_verified === false,
      { player: b.player_name, has_passkey: b.has_passkey, has_password: b.has_password, login_secure: b.login_secure, email_verified: b.email_verified },
    );
    await page.locator(STRIP).waitFor({ timeout: 10000 });
    const t = await stripText(page);
    check("register: the strip asks for the email, and only for the email", t === "Secure your account — add an email address.", t);
    const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    check("register: one resident credential in the authenticator", credentials.length === 1 && credentials[0].isResidentCredential);
    writeFileSync(arg("out"), JSON.stringify(credentials));
  } else if (mode === "verify") {
    const NAME = arg("name");
    const E1 = arg("email");
    const E2 = arg("email2");
    const { cdp, authenticatorId } = await authenticator(context, page);
    await loadCredentials(cdp, authenticatorId, arg("in"));
    await passkeyLogin(page);
    const m = await me(page);
    check(`verify: signed in as ${NAME} with the passkey, nothing typed`, m.status === 200 && m.body.player_name === NAME, m.body && m.body.player_name);

    // add the address in Settings → Email
    await page.goto(`${APP}/settings?tab=account`);
    const form = page.getByRole("form", { name: "Set your email" });
    await form.getByLabel("Email").fill(E1);
    const before1 = sentTo(E1).length;
    await form.getByRole("button", { name: "Send verification link" }).click();
    await page.locator("[data-email-pending]").waitFor({ timeout: 10000 });
    check("verify: the address shows as pending", (await page.getByText(E1, { exact: true }).count()) > 0);
    const mail1 = await waitForMail(E1, before1);
    check("verify: the verification mail is in the sink, with its link", !!mail1 && /\/g\/altherren\/verify-email#/.test(mail1[2]), mail1 && [mail1[0], mail1[1], hide(mail1[2])]);

    // the strip is up on the dashboard while the address is pending
    await page.goto(`${APP}/dashboard`);
    await page.locator(STRIP).waitFor({ timeout: 10000 });
    check("verify: while pending, the dashboard's strip still asks for the email", (await stripText(page)) === "Secure your account — add an email address.");

    // the link, in Safari (a context with no cookie), confirmed by a tap
    await confirmInFreshContext(browser, mail1[2], "verify");
    await page.waitForTimeout(2200); // the return refresh's debounce is 2 s per mount
    await comeBack(page);
    const gone = await waitFor(async () => (await page.locator(STRIP).count()) === 0);
    check("verify: back in the app, a visibilitychange makes the strip go (no reload)", gone);
    const m2 = await me(page);
    check("verify: /me — the address verified", m2.body && m2.body.email === E1 && m2.body.email_verified === true, m2.body && { email: m2.body.email, email_verified: m2.body.email_verified });

    // change it
    await page.goto(`${APP}/settings?tab=account`);
    await page.getByRole("button", { name: "Change email" }).click();
    const form2 = page.getByRole("form", { name: "Set your email" });
    await form2.getByLabel("Email").fill(E2);
    const before2 = sentTo(E2).length;
    const beforeOld = sentTo(E1).length;
    await form2.getByRole("button", { name: "Send verification link" }).click();
    await page.locator("[data-email-pending]").waitFor({ timeout: 10000 });
    const mail2 = await waitForMail(E2, before2);
    check("verify: the change sends a link to the NEW address", !!mail2 && /\/verify-email#/.test(mail2[2]), mail2 && [mail2[0], hide(mail2[2])]);
    await confirmInFreshContext(browser, mail2[2], "change");
    await page.waitForTimeout(2200);
    await comeBack(page);
    const settled = await waitFor(async () => (await page.locator("[data-email-pending]").count()) === 0 && (await page.getByText(E1, { exact: true }).count()) === 0);
    check("change: back in Settings, the row reads the new address, verified, with no reload", settled && (await page.getByText(E2, { exact: true }).count()) > 0);
    const notice = await waitForMail(E1, beforeOld);
    check("change: the OLD address got the notice, and it carries no link", !!notice && notice[2] === "-", notice && [notice[0], notice[1], notice[2]]);
    await saveBack(cdp, authenticatorId, arg("in"));
  } else if (mode === "recover") {
    const USER = arg("user", "Roli");
    const EMAIL = arg("email");
    // a session opened before the recovery (another device), by password
    const ctxOld = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pOld = await ctxOld.newPage();
    await pOld.goto(`${APP}/login`);
    await pOld.getByLabel("Name").fill(USER);
    await pOld.getByLabel("Password", { exact: true }).fill(arg("password"));
    await pOld.getByRole("button", { name: /^log in$/i }).click();
    await pOld.waitForURL(/\/dashboard/, { timeout: 20000 });
    check(`recover: a session of ${USER} opened before the recovery (another device)`, (await me(pOld)).status === 200);

    // this phone's authenticator already holds the account's passkey (step 3's)
    const { cdp, authenticatorId, add } = await authenticator(context, page);
    await loadCredentials(cdp, authenticatorId, arg("in"));
    await page.goto(`${APP}/login`);
    await page.getByRole("link", { name: /Lost your passkey or password\?/ }).click();
    await page.waitForURL(/\/recover/);
    await page.getByLabel("Email").fill(EMAIL);
    const before = sentTo(EMAIL).length;
    await page.getByRole("button", { name: "Send me a link" }).click();
    const said = await page.locator("[data-recovery-sent]").innerText({ timeout: 10000 });
    check("recover: the page's one sentence", said === "If that address is verified, a link is on its way. Check your spam folder too.", said);
    const mail = await waitForMail(EMAIL, before);
    check("recover: the reset link is in the sink, to the verified address", !!mail && /\/g\/altherren\/reset#/.test(mail[2]), mail && [mail[0], mail[1], hide(mail[2])]);

    await page.goto(mail[2]);
    await page.getByRole("heading", { name: "Set a new login" }).waitFor();
    check("recover: Set a new login, the token stripped from the URL", !page.url().includes("#"), page.url().slice(BASE.length));
    // the authenticator that already holds this account's passkey refuses (excludeCredentials)
    await page.getByRole("button", { name: "Create a passkey" }).click();
    const err = page.locator("[data-auth-error]");
    await err.waitFor({ timeout: 20000 });
    const errText = (await err.innerText()).trim();
    check("recover: an authenticator that already holds the account's passkey refuses — the error line says so", errText === "This device could not make a passkey here.", errText);
    check("recover: … and the page stays on the reset link", /\/reset/.test(page.url()), page.url().slice(BASE.length));
    // a second device: remove the first authenticator, add a fresh one, tap again
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
    const second = await add();
    await page.getByRole("button", { name: "Create a passkey" }).click();
    await page.waitForURL(/\/g\/altherren\/dashboard/, { timeout: 20000 });
    const m = await me(page);
    check(`recover: the same link, not spent by the refusal, signs ${USER} in with a new passkey`, m.status === 200 && m.body.player_name === USER, m.body && m.body.player_name);
    const n = await passkeyCount(page);
    check("recover: the account now lists two passkeys (recovery keeps the old one)", n === 2, n);
    const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId: second });
    check("recover: one resident credential in the new authenticator", credentials.length === 1 && credentials[0].isResidentCredential);
    if (arg("out")) writeFileSync(arg("out"), JSON.stringify(credentials));
    check("recover: the session opened before the recovery is ended", (await me(pOld)).status === 401);
    await ctxOld.close();
  } else if (mode === "login") {
    const NAME = arg("name");
    const { cdp, authenticatorId } = await authenticator(context, page);
    await loadCredentials(cdp, authenticatorId, arg("in"));
    await page.goto(`${APP}/login`);
    check("passkey-only login: logged out to begin with", (await me(page)).status === 401);
    await passkeyLogin(page);
    const m = await me(page);
    const b = m.body || {};
    const email = arg("email");
    check(
      `passkey-only login: ${NAME} signs in in a fresh browser with nothing typed, still no password${email ? ", the address verified" : ""}`,
      m.status === 200 && b.player_name === NAME && b.has_password === false && (!email || (b.email === email && b.email_verified === true)),
      { player: b.player_name, has_password: b.has_password, email: b.email, email_verified: b.email_verified },
    );
    if (email) {
      await page.waitForTimeout(800);
      check("passkey-only login: no strip — a passkey and a verified email are all it asks for", (await page.locator(STRIP).count()) === 0);
    }
    await saveBack(cdp, authenticatorId, arg("in"));
  } else {
    throw new Error(`unknown mode ${mode}`);
  }
  await context.close();
} catch (e) {
  failed += 1;
  console.log(`FAIL (threw) ${e && e.message ? e.message.split("\n")[0] : e}`);
} finally {
  await browser.close();
}
process.exit(failed === 0 ? 0 : 1);
