/**
 * The session must survive a request that never reached the server.
 *
 * `AuthProvider` validates the stored token with `GET /me` on every boot. It used
 * to treat *any* rejection as "the token is bad" and log the user out — so an
 * aborted request (Vite's cold-load force reload in dev) or a dropped connection
 * (a PWA on flaky wifi) silently demoted an admin to a reader. Only the server
 * saying 401/403 may clear the session (A9).
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";

const meMock = vi.hoisted(() => vi.fn());
vi.mock("../api/auth.api", () => ({ me: meMock, login: vi.fn() }));

import { AuthProvider, useAuth } from "../auth/AuthContext";

function Probe() {
  const { role, token } = useAuth();
  return <div data-testid="probe">{`${role}:${token ?? "none"}`}</div>;
}

function renderWithSession() {
  localStorage.setItem("ea_fc_token", "stored-token");
  localStorage.setItem("ea_fc_role", "admin");
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe("AuthProvider token validation", () => {
  beforeEach(() => {
    localStorage.clear();
    meMock.mockReset();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("keeps the session when the /me request never reached the server", async () => {
    // What `fetch` throws for an aborted or failed request — no status, no answer.
    meMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithSession();

    await waitFor(() => expect(meMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.getByTestId("probe").textContent).toBe("admin:stored-token");
    expect(localStorage.getItem("ea_fc_token")).toBe("stored-token");
  });

  it("keeps the session when the request was aborted", async () => {
    meMock.mockRejectedValue(new DOMException("The user aborted a request.", "AbortError"));
    renderWithSession();

    await waitFor(() => expect(meMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(localStorage.getItem("ea_fc_token")).toBe("stored-token");
  });

  it("keeps the session when the server is having a bad day (5xx)", async () => {
    meMock.mockRejectedValue(new ApiError(503, "Service Unavailable", ""));
    renderWithSession();

    await waitFor(() => expect(meMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(localStorage.getItem("ea_fc_token")).toBe("stored-token");
  });

  it("clears the session when the server rejects the token (401)", async () => {
    meMock.mockRejectedValue(new ApiError(401, "Unauthorized", "Missing token"));
    renderWithSession();

    await waitFor(() => expect(localStorage.getItem("ea_fc_token")).toBeNull());
    expect(screen.getByTestId("probe").textContent).toBe("reader:none");
  });

  it("clears the session when the server rejects the token (403)", async () => {
    meMock.mockRejectedValue(new ApiError(403, "Forbidden", "Insufficient privileges"));
    renderWithSession();

    await waitFor(() => expect(localStorage.getItem("ea_fc_token")).toBeNull());
  });
});

describe("boot with storage blocked", () => {
  // Safari's "Block all cookies" and some webviews throw on every access.
  it("still renders instead of white-screening", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    try {
      meMock.mockResolvedValue({ role: "reader" });
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
      expect(screen.getByTestId("probe").textContent).toBe("reader:none");
    } finally {
      spy.mockRestore();
      setSpy.mockRestore();
    }
  });
});
