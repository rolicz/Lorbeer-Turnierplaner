/**
 * Getting back in (E3): the recover page says one sentence whatever the server answered —
 * so nothing on screen tells anyone whether an address has an account — and keeps its form
 * only for a 429; the verify-email page strips the token from the address bar first, never
 * POSTs on load (a mail scanner must not spend the link) and confirms on the tap; the login
 * screen links to recovery and, where passkeys exist, says how a phone's passkey signs in on
 * a computer.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lib = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  platformAuthenticatorIsAvailable: vi.fn(() => Promise.resolve(true)),
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => lib);

const auth = vi.hoisted(() => ({
  status: "anonymous" as "anonymous" | "authed" | "unknown",
  signedOutReason: null as "expired" | null,
  setSession: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth }));

import LoginPage from "../pages/auth/LoginPage";
import RecoverPage from "../pages/auth/RecoverPage";
import VerifyEmailPage from "../pages/auth/VerifyEmailPage";

const SENT = "If that address is verified, a link is on its way. Check your spam folder too.";
const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function lastBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  auth.status = "anonymous";
  lib.browserSupportsWebAuthn.mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("RecoverPage", () => {
  function mountRecover() {
    return render(
      <MemoryRouter initialEntries={["/recover"]}>
        <Routes>
          <Route path="/recover" element={<RecoverPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  function send(address: string) {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: address } });
    fireEvent.click(screen.getByRole("button", { name: "Send me a link" }));
  }

  it("posts the address and says the one sentence", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    mountRecover();
    expect(screen.getByRole("heading", { name: "Get back in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    send(" roli@example.test ");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(SENT));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/auth\/recover$/);
    expect(lastBody()).toEqual({ email: "roli@example.test" });
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("says exactly the same after a server error — nothing tells whether the account exists", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { detail: "Internal Server Error" }));
    mountRecover();
    send("nobody@example.test");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(SENT));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("counts a 429 down and keeps the form", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse(429, { detail: { retry_after: 2 } }));
    mountRecover();
    send("roli@example.test");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Too many attempts — try again in 2s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send me a link" })).toBeDisabled();
    expect(screen.queryByText(SENT)).toBeNull();
  });

  it("always names the admin as the way in without a verified email", () => {
    mountRecover();
    expect(screen.getByText("No verified email on your account? Ask the admin for a reset link.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
  });
});

describe("VerifyEmailPage", () => {
  function mountVerify() {
    return render(
      <BrowserRouter>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Routes>
      </BrowserRouter>,
    );
  }

  it("strips the token before anything, and does not POST on load", () => {
    window.history.replaceState(null, "", "/verify-email#tok-mail_1");
    mountVerify();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/verify-email");
    expect(screen.getByRole("heading", { name: "Confirm your email" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirms on the tap — anonymous: the sentence and no way to Settings", async () => {
    window.history.replaceState(null, "", "/verify-email#tok-mail_1");
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, email: "roli@example.test" }));
    mountVerify();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Verified. You can close this and go back to the app."),
    );
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/auth\/email\/verify$/);
    expect(lastBody()).toEqual({ token: "tok-mail_1" });
    expect(screen.queryByRole("link", { name: /back to settings/i })).toBeNull();
  });

  it("logged in: offers the way back to Settings → Account", async () => {
    auth.status = "authed";
    window.history.replaceState(null, "", "/verify-email#tok");
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, email: "roli@example.test" }));
    mountVerify();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByRole("link", { name: /back to settings/i })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /back to settings/i })).toHaveAttribute("href", "/settings?tab=account");
  });

  it("shows a spent link's refusal as the server words it", async () => {
    window.history.replaceState(null, "", "/verify-email#used");
    fetchMock.mockResolvedValue(jsonResponse(400, { detail: "That link is not valid" }));
    mountVerify();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That link is not valid"));
  });

  it("says a link without a token is not complete, and asks nothing", () => {
    window.history.replaceState(null, "", "/verify-email");
    mountVerify();
    expect(screen.getByText("This link is not complete — ask for a new one in Settings → Account.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("LoginPage — the way back and the cross-device hint", () => {
  function mountLogin() {
    return render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("links to recovery", () => {
    mountLogin();
    expect(screen.getByRole("link", { name: /lost your passkey or password/i })).toHaveAttribute("href", "/recover");
  });

  it("says how a phone's passkey signs in on a computer, under the passkey button", () => {
    mountLogin();
    const hint = screen.getByText(
      "Passkey on your phone, logging in on a computer? Choose it in the passkey prompt and scan the code with your phone.",
    );
    expect(hint.closest("[data-passkey-login]")).not.toBeNull();
  });

  it("leaves the hint out where the browser cannot do passkeys, and keeps the recovery link", () => {
    lib.browserSupportsWebAuthn.mockReturnValue(false);
    mountLogin();
    expect(screen.queryByText(/Passkey on your phone/)).toBeNull();
    expect(screen.getByRole("link", { name: /lost your passkey or password/i })).toBeInTheDocument();
  });
});
