/**
 * The login screen (L4): a wrong password is one line under the form, a 429 is a
 * countdown that holds the button for exactly the seconds the server named, and a
 * right password hands the session to the provider and leaves.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { sessionFixture } from "./authFixtures";

const loginMock = vi.hoisted(() => vi.fn());
vi.mock("../api/auth.api", () => ({ login: loginMock, me: vi.fn(), logout: vi.fn(), exchangeLegacyToken: vi.fn() }));

const auth = vi.hoisted(() => ({
  status: "anonymous" as "anonymous" | "authed" | "unknown",
  signedOutReason: null as "expired" | null,
  setSession: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth }));

import LoginPage from "../pages/auth/LoginPage";

function mount(initial = "/login") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<div data-testid="where">elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function submit(name = "roli", pw = "secret-1234") {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: pw } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));
}

describe("LoginPage", () => {
  beforeEach(() => {
    loginMock.mockReset();
    auth.status = "anonymous";
    auth.signedOutReason = null;
    auth.setSession.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a wrong password as one line under the form, and says what the server said", async () => {
    loginMock.mockRejectedValue(new ApiError(401, "Unauthorized", '{"detail":"Wrong username or password"}'));
    mount();
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Wrong username or password"));
    expect(loginMock).toHaveBeenCalledWith("roli", "secret-1234");
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("says the server could not be reached, in words, for a request that never arrived", async () => {
    loginMock.mockRejectedValue(new TypeError("Failed to fetch"));
    mount();
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/could not reach the server/i));
  });

  it("counts a 429 down and holds the button for exactly that long", async () => {
    vi.useFakeTimers();
    loginMock.mockRejectedValue(new ApiError(429, "Too Many Requests", '{"detail":{"retry_after":3}}', 3));
    mount();
    submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Too many attempts — try again in 3s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByText(/try again in [12]s/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByText(/Too many attempts/)).toBeNull();
    expect(screen.getByRole("button", { name: /log in/i })).toBeEnabled();
  });

  it("hands a right password to the provider and leaves for where the reader was going", async () => {
    const me = sessionFixture({ player_name: "Roli" });
    loginMock.mockResolvedValue(me);
    render(
      <MemoryRouter initialEntries={[{ pathname: "/login", state: { from: "/live/3?tab=comments" } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/live/:id" element={<div data-testid="where">live</div>} />
        </Routes>
      </MemoryRouter>,
    );
    submit("Roli", "verify-only");
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("live"));
    expect(auth.setSession).toHaveBeenCalledWith(me);
  });

  it("says why when the session ended without the reader asking", () => {
    auth.signedOutReason = "expired";
    mount();
    expect(screen.getByRole("status").textContent).toBe("Your session has ended — log in again.");
  });

  it("does not ask somebody who is already in", () => {
    auth.status = "authed";
    mount();
    expect(screen.getByTestId("where").textContent).toBe("elsewhere");
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("has no link inside a link and no shell chrome", () => {
    const { container } = mount();
    expect(container.querySelectorAll("a a").length).toBe(0);
    expect(container.querySelector("#app-top-nav")).toBeNull();
    expect(screen.getByRole("link", { name: /register with a code/i })).toHaveAttribute("href", "/register");
  });
});
