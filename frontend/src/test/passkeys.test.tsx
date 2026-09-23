/**
 * Passkeys in the browser (L9): the ceremony module swallows a cancelled sheet into
 * `null`; the login screen offers "Use a passkey" only where WebAuthn exists and says
 * nothing when the sheet is closed; Settings → Passkeys warns before a removal (which ends
 * this session too) and lands on the login screen after it, refuses the last way in
 * before the tap, and offers "Remove password" only with a passkey; the app-wide strip
 * shows for a migrated password with no passkey on a device that can make one — and
 * nowhere else.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import type { Passkey } from "../api/types";
import { sessionFixture } from "./authFixtures";

// ---- the library, mocked: the ceremony module is tested against it ----------------------
const lib = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  platformAuthenticatorIsAvailable: vi.fn(() => Promise.resolve(true)),
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => lib);

const client = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("../api/client", async (orig) => ({ ...(await orig<typeof import("../api/client")>()), apiFetch: client.apiFetch }));

const account = vi.hoisted(() => ({
  listMySessions: vi.fn(() => Promise.resolve([])),
  revokeMySession: vi.fn(),
  revokeMyOthers: vi.fn(),
  changePassword: vi.fn(),
  removePassword: vi.fn(),
  redeemCode: vi.fn(),
}));
vi.mock("../api/account.api", () => account);

const auth = vi.hoisted(() => ({
  status: "anonymous" as "anonymous" | "authed" | "unknown",
  signedOutReason: null as "expired" | null,
  hasPassword: true,
  hasPasskey: false,
  passwordMigrated: false,
  groups: [{ id: 1, slug: "altherren", name: "Altherren", role: "member" as const }],
  setSession: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth }));

import { loginWithPasskey, registerPasskey } from "../api/passkeys.api";
import LoginPage from "../pages/auth/LoginPage";
import SecuritySection from "../pages/settings/SecuritySection";
import SecureAccountNotice from "../ui/shell/SecureAccountNotice";

function notAllowed(): Error {
  const e = new Error("The operation either timed out or was not allowed.");
  e.name = "NotAllowedError";
  return e;
}

const PK: Passkey = {
  id: 4,
  label: "Linux · Chrome",
  device_type: "multi_device",
  backed_up: true,
  created_at: "2026-09-23T10:00:00",
  last_used_at: null,
};

/** apiFetch answers by path: the passkey list, the options, the verify. */
function serve(routes: Record<string, unknown>) {
  client.apiFetch.mockImplementation((path: string) => {
    if (path in routes) {
      const v = routes[path];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
    }
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function mountAt(initial: string, element: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/login" element={element} />
          <Route path="/settings" element={element} />
          <Route path="*" element={<>{element}</>} />
        </Routes>
        <Routes>
          <Route path="/login" element={<div data-testid="on-login" />} />
          <Route path="/dashboard" element={<div data-testid="on-dashboard" />} />
          <Route path="*" element={null} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  lib.browserSupportsWebAuthn.mockReturnValue(true);
  auth.status = "anonymous";
  auth.hasPassword = true;
  auth.hasPasskey = false;
  auth.passwordMigrated = false;
  auth.refresh.mockResolvedValue(undefined);
  auth.logout.mockResolvedValue(undefined);
});

describe("passkeys.api", () => {
  it("hands the server's options to the library untouched and posts what it returns", async () => {
    const options = { challenge: "abc", rp: { id: "localhost", name: "Lorbeerkranz" } };
    serve({ "/auth/passkeys/register/options": options, "/auth/passkeys/register/verify": PK });
    lib.startRegistration.mockResolvedValue({ id: "cred" });
    await expect(registerPasskey("  ")).resolves.toEqual(PK);
    expect(lib.startRegistration).toHaveBeenCalledWith({ optionsJSON: options });
    const verify = client.apiFetch.mock.calls.find((c) => c[0] === "/auth/passkeys/register/verify") as
      | [string, RequestInit]
      | undefined;
    // An empty label stays empty: the server names it after the device.
    expect(JSON.parse(verify?.[1].body as string)).toEqual({ credential: { id: "cred" }, label: "" });
  });

  it("treats a closed sheet as nothing at all — null, and no verify request", async () => {
    serve({ "/auth/passkeys/login/options": { challenge: "x" } });
    lib.startAuthentication.mockRejectedValue(notAllowed());
    await expect(loginWithPasskey()).resolves.toBeNull();
    expect(client.apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe("LoginPage — Use a passkey", () => {
  it("is not offered where the browser cannot do WebAuthn", () => {
    lib.browserSupportsWebAuthn.mockReturnValue(false);
    mountAt("/login", <LoginPage />);
    expect(screen.queryByRole("button", { name: /use a passkey/i })).toBeNull();
  });

  it("comes after the password form, signs in with no name typed, and goes on", async () => {
    const me = sessionFixture({ has_passkey: true });
    serve({ "/auth/passkeys/login/options": { challenge: "x" }, "/auth/passkeys/login/verify": me });
    lib.startAuthentication.mockResolvedValue({ id: "cred" });
    mountAt("/login", <LoginPage />);
    const pk = screen.getByRole("button", { name: /use a passkey/i });
    const logIn = screen.getByRole("button", { name: /^log in$/i });
    expect(logIn.compareDocumentPosition(pk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(pk);
    await waitFor(() => expect(auth.setSession).toHaveBeenCalledWith(me));
    expect(await screen.findByTestId("on-dashboard")).toBeTruthy();
  });

  it("says nothing when the sheet is closed, and the server's sentence when it refuses", async () => {
    serve({ "/auth/passkeys/login/options": { challenge: "x" } });
    lib.startAuthentication.mockRejectedValueOnce(notAllowed());
    mountAt("/login", <LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /use a passkey/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /use a passkey/i })).not.toBeDisabled());
    expect(screen.queryByRole("alert")).toBeNull();

    serve({
      "/auth/passkeys/login/options": { challenge: "y" },
      "/auth/passkeys/login/verify": new ApiError(401, "Unauthorized", '{"detail":"That passkey could not be used to log in"}'),
    });
    lib.startAuthentication.mockResolvedValue({ id: "cred" });
    fireEvent.click(screen.getByRole("button", { name: /use a passkey/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That passkey could not be used to log in"));
    expect(auth.setSession).not.toHaveBeenCalled();
  });
});

describe("Settings → Passkeys", () => {
  beforeEach(() => {
    auth.status = "authed";
  });

  it("adds a passkey, asks /me again, and a closed sheet is silent", async () => {
    serve({ "/auth/passkeys": [], "/auth/passkeys/register/options": { challenge: "x" }, "/auth/passkeys/register/verify": PK });
    lib.startRegistration.mockRejectedValueOnce(notAllowed()).mockResolvedValueOnce({ id: "cred" });
    mountAt("/settings", <SecuritySection />);
    await screen.findByText("No passkeys yet.");
    const add = screen.getAllByRole("button", { name: /add a passkey/i })[0];
    fireEvent.click(add);
    await waitFor(() => expect(add).not.toBeDisabled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(auth.refresh).not.toHaveBeenCalled();

    fireEvent.click(add);
    await waitFor(() => expect(auth.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/passkey added/i)).toBeTruthy();
  });

  it("disables removing the last way in and says why before the tap", async () => {
    auth.hasPassword = false;
    auth.hasPasskey = true;
    serve({ "/auth/passkeys": [PK] });
    mountAt("/settings", <SecuritySection />);
    const remove = await screen.findByRole("button", { name: "Remove Linux · Chrome" });
    expect(remove).toBeDisabled();
    expect(remove.getAttribute("title")).toMatch(/set a password before removing your last passkey/i);
    expect(document.querySelector("[data-passkey-last]")).not.toBeNull();
    expect(within(remove.closest(".row") as HTMLElement).getByText("synced")).toBeTruthy();
  });

  it("warns that every device is signed out, then removes, logs out and lands on login", async () => {
    auth.hasPasskey = true;
    serve({ "/auth/passkeys": [PK], "/auth/passkeys/4": { ok: true } });
    mountAt("/settings", <SecuritySection />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Linux · Chrome" }));
    expect(screen.getByText("Every device will be signed out, including this one.")).toBeTruthy();
    expect(client.apiFetch).not.toHaveBeenCalledWith("/auth/passkeys/4", expect.anything());
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Remove passkey" }));
    });
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
    expect(client.apiFetch).toHaveBeenCalledWith("/auth/passkeys/4", { method: "DELETE" });
    expect(await screen.findByTestId("on-login")).toBeTruthy();
  });

  it("offers Remove password only while a passkey exists", async () => {
    serve({ "/auth/passkeys": [] });
    const { unmount } = mountAt("/settings", <SecuritySection />);
    await screen.findByText("No passkeys yet.");
    expect(screen.queryByRole("button", { name: "Remove password" })).toBeNull();
    unmount();

    auth.hasPasskey = true;
    account.removePassword.mockResolvedValue(sessionFixture({ has_password: false, has_passkey: true }));
    serve({ "/auth/passkeys": [PK] });
    mountAt("/settings", <SecuritySection />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove password" }));
    const buttons = screen.getAllByRole("button", { name: "Remove password" });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(account.removePassword).toHaveBeenCalledTimes(1));
    expect(auth.refresh).toHaveBeenCalled();
  });

  it("says so, and offers no add, where the browser cannot make passkeys", async () => {
    lib.browserSupportsWebAuthn.mockReturnValue(false);
    serve({ "/auth/passkeys": [] });
    mountAt("/settings", <SecuritySection />);
    expect(await screen.findByText("This browser cannot make passkeys.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /add a passkey/i })).toBeNull();
  });
});

describe("SecureAccountNotice", () => {
  beforeEach(() => {
    auth.status = "authed";
    auth.passwordMigrated = true;
    auth.hasPasskey = false;
  });

  const shown = () => document.querySelector("[data-secure-account-notice]") !== null;

  it("shows for a migrated password with no passkey, links to Settings, and cannot be dismissed", () => {
    mountAt("/dashboard", <SecureAccountNotice />);
    expect(shown()).toBe(true);
    const link = screen.getByRole("link", { name: "Add a passkey" });
    expect(link.getAttribute("href")).toBe("/settings?tab=account");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is gone once a passkey exists, for a password that is not the given one, and on a device that cannot comply", () => {
    auth.hasPasskey = true;
    const a = mountAt("/dashboard", <SecureAccountNotice />);
    expect(shown()).toBe(false);
    a.unmount();

    auth.hasPasskey = false;
    auth.passwordMigrated = false;
    const b = mountAt("/dashboard", <SecureAccountNotice />);
    expect(shown()).toBe(false);
    b.unmount();

    auth.passwordMigrated = true;
    lib.browserSupportsWebAuthn.mockReturnValue(false);
    mountAt("/dashboard", <SecureAccountNotice />);
    expect(shown()).toBe(false);
  });

  it("does not point at the page that answers it", () => {
    mountAt("/settings?tab=account", <SecureAccountNotice />);
    expect(shown()).toBe(false);
  });
});
