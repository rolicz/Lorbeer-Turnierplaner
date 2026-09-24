#!/usr/bin/env node
// L9 — passkeys end to end, through the real UI, in Chromium with CDP's virtual
// authenticator (ctap2 / internal / resident key / user verification).
//
// WebAuthn needs a secure context: http://localhost is one, the LAN IP over plain http is
// not — so the stack must be reached as `localhost`, and the backend must run in
// dev-origin mode (AUTH_DEV_ORIGIN=1) so the relying party is derived from `Origin`.
//
//   node scripts/passkey_e2e.mjs --base http://localhost:8260 --user Berni \
//     --password verify-only --new-password another-password-1 --width 390 --theme blue \
//     [--shots /some/dir]
//
// The account must have a password and no passkey. The run leaves it with the new
// password and no passkey. It walks: password login → the "secure your account" strip →
// Settings → add a passkey → the strip is gone → log out → "Use a passkey" signs in with
// no name typed → remove the password → the last passkey cannot be removed (the button
// says why; the server answers 409 with the same sentence) → set a password → remove the
// passkey, warned first → the login screen, and the session is gone.
//
// Playwright: `PLAYWRIGHT=/path/to/node_modules/playwright` if it is not resolvable.
// It proves the ceremony in Chromium and nothing about Safari, Face ID or iCloud Keychain.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const BASE = arg("base", "http://localhost:8260");
const USER = arg("user", "Berni");
const PASSWORD = arg("password", "verify-only");
const NEW_PASSWORD = arg("new-password", "another-password-1");
const WIDTH = Number(arg("width", "390"));
const THEME = arg("theme", "blue");
const SHOTS = arg("shots", null);
const APP = `${BASE}/g/altherren`;

const results = [];
let failed = 0;
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}
async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${WIDTH}-${THEME}-${name}.png`), fullPage: false });
}
const me = (page) =>
  page.evaluate(async () => {
    const r = await fetch("/api/me");
    return { status: r.status, body: r.status === 200 ? await r.json() : null };
  });
const layout = (page) =>
  page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    nestedLinks: document.querySelectorAll("a a").length,
  }));
const noticeBox = (page) =>
  page.evaluate(() => {
    const el = document.querySelector("[data-secure-account-notice]");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, bg: getComputedStyle(el).backgroundColor };
  });
const tabsTop = (page) =>
  page.evaluate(() => {
    const el = document.querySelector("[data-section-tabs]");
    return el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null;
  });
const titleCentre = (page) =>
  page.evaluate(() => {
    const nav = document.getElementById("app-top-nav");
    const h = nav && nav.querySelector("[data-testid=top-bar-title]");
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return Math.round((r.left + r.width / 2) * 10) / 10;
  });

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 844 } });
  await context.addInitScript((theme) => {
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* ignore */
    }
  }, THEME);
  const page = await context.newPage();
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

  // ---- 1. the login card ----------------------------------------------------------------
  await page.goto(`${APP}/login`);
  await page.getByRole("button", { name: /^log in$/i }).waitFor();
  check("secure context", await page.evaluate(() => window.isSecureContext));
  const pkButton = page.getByRole("button", { name: "Use a passkey" });
  check("login: 'Use a passkey' is offered", await pkButton.isVisible());
  check(
    "login: it comes after the password form",
    await page.evaluate(() => {
      const logIn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Log in");
      const pk = document.querySelector("[data-passkey-login] button");
      return !!(logIn && pk && logIn.compareDocumentPosition(pk) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  );
  check("login: one password field, with its eye toggle", await page.getByRole("button", { name: "Show password" }).count() === 1);
  const l0 = await layout(page);
  check("login: no horizontal overflow, no nested links", !l0.overflow && l0.nestedLinks === 0, l0);
  await shot(page, "login");

  // ---- 2. password login; the strip -----------------------------------------------------
  await page.getByLabel("Name").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/);
  const m0 = await me(page);
  check("password login", m0.status === 200 && m0.body.password_migrated && !m0.body.has_passkey, m0.body);
  await page.waitForSelector("[data-secure-account-notice]");
  const strip = await noticeBox(page);
  check("strip: shown for a migrated password with no passkey", !!strip, strip);
  check("strip: no dismiss control", (await page.locator("[data-secure-account-notice] button").count()) === 0);
  const centreWith = WIDTH < 1024 ? await titleCentre(page) : null;
  await shot(page, "strip-dashboard");

  // The tab strip's offset with the strip (a tabbed page that is not the account tab).
  await page.goto(`${APP}/settings?tab=appearance`);
  await page.waitForSelector("[data-section-tabs]");
  await page.waitForSelector("[data-secure-account-notice]");
  const tabsWith = await tabsTop(page);

  // Follow the strip's own link.
  await page.getByRole("link", { name: "Add a passkey" }).click();
  await page.waitForURL(/tab=account|\/settings$/);
  await page.getByText("Passkeys", { exact: true }).waitFor();
  check("strip: not shown on the page that answers it", (await noticeBox(page)) === null);
  const tabsWithout = await tabsTop(page);

  // ---- 3. add a passkey ----------------------------------------------------------------
  await page.getByText("No passkeys yet.").waitFor();
  await shot(page, "settings-before");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await page.getByText(/Passkey added/).waitFor();
  const creds = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  check("add: one resident credential in the authenticator", creds.credentials.length === 1 && creds.credentials[0].isResidentCredential);
  const m1 = await me(page);
  check("add: /me has_passkey", m1.body.has_passkey === true);
  const rows = await page.locator("[aria-label^='Remove ']").count();
  check("add: one passkey row", rows === 1);
  const l1 = await layout(page);
  check("settings: no horizontal overflow, no nested links", !l1.overflow && l1.nestedLinks === 0, l1);
  await shot(page, "settings-passkey");

  await page.goto(`${APP}/dashboard`);
  await page.waitForLoadState("networkidle");
  check("strip: gone once a passkey exists", (await noticeBox(page)) === null);
  const centreWithout = WIDTH < 1024 ? await titleCentre(page) : null;
  if (WIDTH < 1024) check("top bar title centre unmoved by the strip", centreWith === centreWithout, { centreWith, centreWithout });
  await page.goto(`${APP}/settings?tab=appearance`);
  await page.waitForSelector("[data-section-tabs]");
  const tabsNone = await tabsTop(page);
  check("tab strip offset: with strip vs without", tabsWith !== null && tabsNone !== null && tabsWith > tabsNone, {
    tabsWith,
    tabsNone,
    delta: tabsWith - tabsNone,
    stripHeight: strip && strip.h,
    tabsOnAccountTab: tabsWithout,
  });

  // ---- 4. log out; sign in with the passkey, no name typed -----------------------------
  await page.goto(`${APP}/settings?tab=account`);
  await page.getByRole("button", { name: "Log out" }).first().click();
  await page.locator("div.fixed.inset-0.z-50").getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/login/);
  check("logout: /me is 401", (await me(page)).status === 401);
  await page.getByRole("button", { name: "Use a passkey" }).click();
  await page.waitForURL(/\/dashboard/);
  const m2 = await me(page);
  check("passkey login: signed in as the same account, nothing typed", m2.status === 200 && m2.body.player_name === USER, m2.body && m2.body.player_name);

  // ---- 5. remove the password (allowed now) ---------------------------------------------
  await page.goto(`${APP}/settings?tab=account`);
  await page.getByRole("button", { name: "Remove password" }).click();
  await page.locator("div.fixed.inset-0.z-50").getByRole("button", { name: "Remove password" }).click();
  await page.getByText("Password removed.", { exact: false }).waitFor();
  check("remove password: /me has_password false", (await me(page)).body.has_password === false);

  // ---- 6. the last passkey: refused, with the server's sentence ------------------------
  const trash = page.locator("[aria-label^='Remove ']").first();
  const lastTitle = await trash.getAttribute("title");
  check("last way in: the button is disabled", await trash.isDisabled());
  check("last way in: it says why before the tap", /Set a password before removing your last passkey/.test(lastTitle ?? ""), lastTitle);
  const direct = await page.evaluate(async () => {
    const list = await (await fetch("/api/auth/passkeys")).json();
    const r = await fetch(`/api/auth/passkeys/${list[0].id}`, { method: "DELETE" });
    return { status: r.status, detail: (await r.json()).detail };
  });
  check("last way in: the server refuses with 409 and the same sentence", direct.status === 409 && lastTitle?.startsWith(direct.detail), direct);
  await shot(page, "settings-last-way-in");

  // ---- 7. set a password -----------------------------------------------------------------
  await page.getByRole("button", { name: "Set a password" }).click();
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Password changed.", { exact: false }).waitFor();
  check("set password: /me has_password", (await me(page)).body.has_password === true);
  check("the passkey can be removed again", !(await trash.isDisabled()));

  // ---- 8. remove the passkey: warned first, then the login screen -----------------------
  await trash.click();
  const dialog = page.locator("div.fixed.inset-0.z-50");
  check("remove passkey: warned that every device is signed out", await dialog.getByText("Every device will be signed out, including this one.").isVisible());
  await shot(page, "remove-passkey-dialog");
  await dialog.getByRole("button", { name: "Remove passkey" }).click();
  await page.waitForURL(/\/login/);
  check("remove passkey: landed on the login screen", /\/login/.test(page.url()), page.url());
  check("remove passkey: the session is gone", (await me(page)).status === 401);
  check("remove passkey: no 'session ended' line (it was asked for)", (await page.getByText("Your session has ended").count()) === 0);

  // The credential still sits in the authenticator; the server no longer knows it.
  await page.getByRole("button", { name: "Use a passkey" }).click();
  await page.locator("[data-login-error]").waitFor();
  check("a removed passkey cannot sign in", (await page.locator("[data-login-error]").textContent()) === "That passkey could not be used to log in");
  // And the new password does.
  await page.getByLabel("Name").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(/\/dashboard/);
  check("the new password logs in", (await me(page)).status === 200);
  await context.close();
} catch (e) {
  failed += 1;
  console.log(`FAIL (threw) ${e && e.message}`);
} finally {
  await browser.close();
}
console.log(`${failed === 0 ? "ALL PASSED" : `${failed} FAILED`} — ${results.length} checks at ${WIDTH}px ${THEME} as ${USER}`);
process.exit(failed === 0 ? 0 : 1);
