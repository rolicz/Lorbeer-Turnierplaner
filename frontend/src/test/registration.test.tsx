/**
 * Register, reset and "not in a group yet" (L5; passkey first since E3 — both pages choose
 * the credential through `PasskeyOrPassword`, and where WebAuthn is missing only the
 * password form shows, which is the state the L5 cases below run in). The invite code is formatted for the eye
 * and posted raw; the password hint is the only rule; a 429 is the countdown; the reset
 * page takes the token out of the address bar before it sends anything; a link without a
 * token says so; the join screen hands the new membership straight to the provider.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { sessionFixture } from "./authFixtures";

const account = vi.hoisted(() => ({ redeemCode: vi.fn() }));
vi.mock("../api/account.api", () => account);

// The WebAuthn library, mocked: off by default (jsdom has no WebAuthn, and the L5 cases
// are the password-only view); the E3 cases switch it on.
const lib = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => false),
  platformAuthenticatorIsAvailable: vi.fn(() => Promise.resolve(false)),
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => lib);

const auth = vi.hoisted(() => ({
  status: "anonymous" as "anonymous" | "authed" | "unknown",
  setSession: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth }));

import NoGroupPage from "../pages/auth/NoGroupPage";
import RegisterPage from "../pages/auth/RegisterPage";
import ResetPage from "../pages/auth/ResetPage";
import { formatInviteCode, normalizeInviteCode } from "../pages/auth/inviteCode";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mountRegister(initial = "/register") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<div data-testid="where">elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillRegister(code: string, name: string, pw: string) {
  fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: code } });
  fireEvent.change(screen.getByLabelText("Display name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: pw } });
}

function lastBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe("the invite code", () => {
  it("shows ABCD-EFGH and keeps the raw eight", () => {
    expect(normalizeInviteCode("abcd efgh")).toBe("ABCDEFGH");
    expect(formatInviteCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(formatInviteCode("ABC")).toBe("ABC");
  });

  it("refuses the four characters the server's alphabet leaves out", () => {
    expect(normalizeInviteCode("O0I1ab")).toBe("AB");
    expect(normalizeInviteCode("ABCD-EFGH-JKLM")).toBe("ABCDEFGH");
  });
});

describe("RegisterPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    auth.status = "anonymous";
    auth.setSession.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("formats what is typed and posts the raw code", async () => {
    const me = sessionFixture({ player_name: "Neu" });
    fetchMock.mockResolvedValue(jsonResponse(200, me));
    mountRegister();
    fillRegister("abcd efgh", "  Neu ", "long-enough-pw-1");
    expect(screen.getByLabelText("Invite code")).toHaveValue("ABCD-EFGH");
    fireEvent.click(screen.getByRole("button", { name: /register/i }));
    await waitFor(() => expect(screen.getByTestId("where")).toBeInTheDocument());
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/auth\/register$/);
    expect(lastBody()).toEqual({ code: "ABCDEFGH", display_name: "Neu", password: "long-enough-pw-1" });
    expect(auth.setSession).toHaveBeenCalledWith(me);
  });

  it("prefills the code from a ?code= link", () => {
    mountRegister("/register?code=wxyz-2345");
    expect(screen.getByLabelText("Invite code")).toHaveValue("WXYZ-2345");
  });

  it("states the one password rule and marks it met", () => {
    mountRegister();
    fillRegister("ABCDEFGH", "Neu", "short");
    const hint = screen.getByText("At least 15 characters");
    expect(hint).toHaveAttribute("data-password-hint", "unmet");
    expect(screen.getByRole("button", { name: /register/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "01234567890123" } });
    expect(hint).toHaveAttribute("data-password-hint", "unmet");
    expect(screen.getByRole("button", { name: /register/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "012345678901234" } });
    expect(hint).toHaveAttribute("data-password-hint", "met");
    expect(hint.className).toContain("text-text-normal");
    expect(screen.getByRole("button", { name: /register/i })).toBeEnabled();
  });

  it("shows the server's refusal verbatim and keeps what was typed", async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { detail: "That name is taken" }));
    mountRegister();
    fillRegister("ABCDEFGH", "roli", "long-enough-pw-1");
    fireEvent.click(screen.getByRole("button", { name: /register/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That name is taken"));
    expect(screen.getByLabelText("Invite code")).toHaveValue("ABCD-EFGH");
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("counts a 429 down and holds the button", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse(429, { detail: { retry_after: 2 } }));
    mountRegister();
    fillRegister("ABCDEFGH", "Neu", "long-enough-pw-1");
    fireEvent.click(screen.getByRole("button", { name: /register/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Too many attempts — try again in 2s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /register/i })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.queryByText(/Too many attempts/)).toBeNull();
    expect(screen.getByRole("button", { name: /register/i })).toBeEnabled();
  });
});

describe("ResetPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    auth.setSession.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  function mountReset() {
    return render(
      <BrowserRouter>
        <Routes>
          <Route path="/reset" element={<ResetPage />} />
          <Route path="*" element={<div data-testid="where">elsewhere</div>} />
        </Routes>
      </BrowserRouter>,
    );
  }

  it("takes the token out of the address bar before any request, then sends it", async () => {
    window.history.replaceState(null, "", "/reset#tok-abc_123");
    const replace = vi.spyOn(window.history, "replaceState");
    const me = sessionFixture();
    fetchMock.mockResolvedValue(jsonResponse(200, me));
    mountReset();

    expect(replace).toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/reset");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "long-enough-pw-1" } });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));
    await waitFor(() => expect(screen.getByTestId("where")).toBeInTheDocument());
    expect(replace.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(lastBody()).toEqual({ token: "tok-abc_123", password: "long-enough-pw-1" });
    expect(auth.setSession).toHaveBeenCalledWith(me);
  });

  it("reads ?token= too, and drops it from the URL", () => {
    window.history.replaceState(null, "", "/reset?token=qwerty");
    mountReset();
    expect(window.location.search).toBe("");
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("shows a spent link's refusal as the server words it", async () => {
    window.history.replaceState(null, "", "/reset#used");
    fetchMock.mockResolvedValue(jsonResponse(400, { detail: "That reset link is not valid" }));
    mountReset();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "long-enough-pw-1" } });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That reset link is not valid"));
  });

  it("says a link without a token is not complete, and asks nothing", () => {
    window.history.replaceState(null, "", "/reset");
    mountReset();
    expect(screen.getByText("This link is not complete — ask for a new one from the login screen or the admin.")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("NoGroupPage", () => {
  beforeEach(() => {
    account.redeemCode.mockReset();
    auth.setSession.mockReset();
    auth.logout.mockReset();
  });

  function mountNoGroup() {
    return render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/login" element={<div data-testid="where">login</div>} />
          <Route path="*" element={<NoGroupPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("joins with the raw code and hands the answer to the provider", async () => {
    const me = sessionFixture();
    account.redeemCode.mockResolvedValue(me);
    mountNoGroup();
    expect(screen.getByText("You're not in a group yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "wxyz 2345" } });
    fireEvent.click(screen.getByRole("button", { name: /join/i }));
    await waitFor(() => expect(auth.setSession).toHaveBeenCalledWith(me));
    expect(account.redeemCode).toHaveBeenCalledWith("WXYZ2345");
  });

  it("shows a bad code's refusal verbatim", async () => {
    account.redeemCode.mockRejectedValue(new ApiError(400, "Bad Request", '{"detail":"That code is not valid"}'));
    mountNoGroup();
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "ZZZZZZZZ" } });
    fireEvent.click(screen.getByRole("button", { name: /join/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That code is not valid"));
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("always offers a way out", async () => {
    auth.logout.mockResolvedValue(undefined);
    mountNoGroup();
    fireEvent.click(screen.getByRole("button", { name: /log out/i }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("login"));
  });
});

describe("passkey first (E3)", () => {
  const OPTIONS = { challenge: "c2hhbGxvdw", rp: { id: "localhost", name: "Lorbeerkranz" } };
  const CREDENTIAL = { id: "cred-1", rawId: "cred-1", type: "public-key", response: {} };

  function notAllowed(): Error {
    const e = new Error("The operation either timed out or was not allowed.");
    e.name = "NotAllowedError";
    return e;
  }

  /** fetch answers by path; every call is recorded in `fetchMock`. */
  function serve(routes: Record<string, [number, unknown]>) {
    fetchMock.mockImplementation((url: string) => {
      const hit = Object.keys(routes).find((p) => String(url).endsWith(p));
      if (!hit) return Promise.reject(new Error(`unexpected ${url}`));
      const [status, body] = routes[hit];
      return Promise.resolve(jsonResponse(status, body));
    });
  }

  function paths(): string[] {
    return fetchMock.mock.calls.map((c) => String(c[0]).replace(/^.*\/auth\//, "/auth/"));
  }

  function bodyOf(path: string): Record<string, unknown> {
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith(path));
    return JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
  }

  function mountReset() {
    return render(
      <BrowserRouter>
        <Routes>
          <Route path="/reset" element={<ResetPage />} />
          <Route path="/dashboard" element={<div data-testid="on-dashboard" />} />
        </Routes>
      </BrowserRouter>,
    );
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    auth.status = "anonymous";
    auth.setSession.mockReset();
    lib.browserSupportsWebAuthn.mockReturnValue(true);
    lib.startRegistration.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    lib.browserSupportsWebAuthn.mockReturnValue(false);
    window.history.replaceState(null, "", "/");
  });

  it("register offers Create a passkey first, and swaps to the password form and back", () => {
    mountRegister();
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Create a passkey", "Use a password instead"]);
    expect(screen.queryByLabelText("Password")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Use a password instead" }));
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^register$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create a passkey" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /create a passkey instead/i }));
    expect(screen.getByRole("button", { name: "Create a passkey" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("where WebAuthn is missing, shows the password form alone and never mentions passkeys", () => {
    lib.browserSupportsWebAuthn.mockReturnValue(false);
    mountRegister();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/passkey/i);
  });

  it("holds Create a passkey until the code has eight symbols and a name is typed", () => {
    mountRegister();
    const create = screen.getByRole("button", { name: "Create a passkey" });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "ABCDEFG" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Neu" } });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "ABCDEFGH" } });
    expect(create).toBeEnabled();
  });

  it("a passkey registration posts the code and name, then the credential with label \"\", and hands MeOut on", async () => {
    const me = sessionFixture({ player_name: "Neu", has_password: false, has_passkey: true });
    serve({ "/auth/register/passkey/options": [200, OPTIONS], "/auth/register/passkey/verify": [200, me] });
    lib.startRegistration.mockResolvedValue(CREDENTIAL);
    mountRegister();
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "abcd-efgh" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: " Neu " } });
    fireEvent.click(screen.getByRole("button", { name: "Create a passkey" }));
    await waitFor(() => expect(screen.getByTestId("where")).toBeInTheDocument());
    expect(bodyOf("/auth/register/passkey/options")).toEqual({ code: "ABCDEFGH", display_name: "Neu" });
    expect(lib.startRegistration).toHaveBeenCalledWith({ optionsJSON: OPTIONS });
    expect(bodyOf("/auth/register/passkey/verify")).toEqual({ label: "", credential: CREDENTIAL });
    expect(auth.setSession).toHaveBeenCalledWith(me);
  });

  it("a closed sheet on register says nothing and spends nothing — no verify request", async () => {
    serve({ "/auth/register/passkey/options": [200, OPTIONS] });
    lib.startRegistration.mockRejectedValue(notAllowed());
    mountRegister();
    fillRegisterIdentity();
    fireEvent.click(screen.getByRole("button", { name: "Create a passkey" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Create a passkey" })).toBeEnabled());
    expect(paths()).toEqual(["/auth/register/passkey/options"]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("shows the server's passkey refusal verbatim on the one error line", async () => {
    serve({ "/auth/register/passkey/options": [409, { detail: "That name is taken" }] });
    mountRegister();
    fillRegisterIdentity();
    fireEvent.click(screen.getByRole("button", { name: "Create a passkey" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That name is taken"));
    expect(lib.startRegistration).not.toHaveBeenCalled();
  });

  it("the reset page says what it is, and offers the same choice", () => {
    window.history.replaceState(null, "", "/reset#tok");
    mountReset();
    expect(screen.getByRole("heading", { name: "Set a new login" })).toBeInTheDocument();
    expect(screen.getByText("This link works once. Using it signs out every other device.")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use a password instead" }));
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set password/i })).toBeInTheDocument();
  });

  it("a reset token consumed by a passkey goes to the dashboard", async () => {
    window.history.replaceState(null, "", "/reset#tok-xyz");
    const me = sessionFixture({ has_passkey: true });
    serve({ "/auth/reset/passkey/options": [200, OPTIONS], "/auth/reset/passkey/verify": [200, me] });
    lib.startRegistration.mockResolvedValue(CREDENTIAL);
    mountReset();
    expect(window.location.hash).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Create a passkey" }));
    await waitFor(() => expect(screen.getByTestId("on-dashboard")).toBeInTheDocument());
    expect(bodyOf("/auth/reset/passkey/options")).toEqual({ token: "tok-xyz" });
    expect(bodyOf("/auth/reset/passkey/verify")).toEqual({ token: "tok-xyz", label: "", credential: CREDENTIAL });
    expect(auth.setSession).toHaveBeenCalledWith(me);
  });

  it("a closed sheet on reset leaves the link live and says nothing", async () => {
    window.history.replaceState(null, "", "/reset#tok-xyz");
    serve({ "/auth/reset/passkey/options": [200, OPTIONS] });
    lib.startRegistration.mockRejectedValue(notAllowed());
    mountReset();
    fireEvent.click(screen.getByRole("button", { name: "Create a passkey" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Create a passkey" })).toBeEnabled());
    expect(paths()).toEqual(["/auth/reset/passkey/options"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  function fillRegisterIdentity() {
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "ABCDEFGH" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Neu" } });
  }
});
