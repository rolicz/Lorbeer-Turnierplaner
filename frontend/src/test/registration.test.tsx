/**
 * Register, reset and "not in a group yet" (L5). The invite code is formatted for the eye
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
    fillRegister("abcd efgh", "  Neu ", "long-enough-1");
    expect(screen.getByLabelText("Invite code")).toHaveValue("ABCD-EFGH");
    fireEvent.click(screen.getByRole("button", { name: /register/i }));
    await waitFor(() => expect(screen.getByTestId("where")).toBeInTheDocument());
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/auth\/register$/);
    expect(lastBody()).toEqual({ code: "ABCDEFGH", display_name: "Neu", password: "long-enough-1" });
    expect(auth.setSession).toHaveBeenCalledWith(me);
  });

  it("prefills the code from a ?code= link", () => {
    mountRegister("/register?code=wxyz-2345");
    expect(screen.getByLabelText("Invite code")).toHaveValue("WXYZ-2345");
  });

  it("states the one password rule and marks it met", () => {
    mountRegister();
    fillRegister("ABCDEFGH", "Neu", "short");
    const hint = screen.getByText("At least 10 characters");
    expect(hint).toHaveAttribute("data-password-hint", "unmet");
    expect(screen.getByRole("button", { name: /register/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "0123456789" } });
    expect(hint).toHaveAttribute("data-password-hint", "met");
    expect(hint.className).toContain("text-text-normal");
    expect(screen.getByRole("button", { name: /register/i })).toBeEnabled();
  });

  it("shows the server's refusal verbatim and keeps what was typed", async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { detail: "That name is taken" }));
    mountRegister();
    fillRegister("ABCDEFGH", "roli", "long-enough-1");
    fireEvent.click(screen.getByRole("button", { name: /register/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That name is taken"));
    expect(screen.getByLabelText("Invite code")).toHaveValue("ABCD-EFGH");
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("counts a 429 down and holds the button", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse(429, { detail: { retry_after: 2 } }));
    mountRegister();
    fillRegister("ABCDEFGH", "Neu", "long-enough-1");
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

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "long-enough-1" } });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));
    await waitFor(() => expect(screen.getByTestId("where")).toBeInTheDocument());
    expect(replace.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(lastBody()).toEqual({ token: "tok-abc_123", password: "long-enough-1" });
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
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "long-enough-1" } });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That reset link is not valid"));
  });

  it("says a link without a token is not complete, and asks nothing", () => {
    window.history.replaceState(null, "", "/reset");
    mountReset();
    expect(screen.getByText("This link is not complete — ask the admin for a new one.")).toBeInTheDocument();
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
