/**
 * When is the app logged out? Only when the server is reachable and says so (L4).
 *
 * `AuthProvider` boots from the cached `GET /me` answer and asks the server again. It
 * used to treat *any* rejection as "the token is bad" and log the user out — so an
 * aborted request (Vite's cold-load force reload in dev) or a dropped connection (a
 * PWA on flaky wifi) silently demoted an admin to a reader (A9). With the cookie the
 * rule is the same and sharper: a 401 ends the session, nothing else does, and a boot
 * with nothing cached and no answer is `unknown` — a loading screen, never a login.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { sessionFixture, seedSession, ME_STORAGE_KEY } from "./authFixtures";

const meMock = vi.hoisted(() => vi.fn());
const exchangeMock = vi.hoisted(() => vi.fn());
const logoutMock = vi.hoisted(() => vi.fn());
vi.mock("../api/auth.api", () => ({
  me: meMock,
  login: vi.fn(),
  logout: logoutMock,
  exchangeLegacyToken: exchangeMock,
}));

import { AuthProvider } from "../auth/AuthProvider";
import { useAuth } from "../auth/AuthContext";

function Probe() {
  const { status, role, playerId, serverUnreachable, signedOutReason, logout } = useAuth();
  return (
    <div>
      <div data-testid="probe">{`${status}:${role}:${playerId ?? "-"}`}</div>
      <div data-testid="flags">{`${serverUnreachable ? "unreachable" : "reachable"}:${signedOutReason ?? "-"}`}</div>
      <button type="button" onClick={() => void logout()}>
        out
      </button>
    </div>
  );
}

function mount() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

const probe = () => screen.getByTestId("probe").textContent;
const flags = () => screen.getByTestId("flags").textContent;
const networkError = () => new TypeError("Failed to fetch");

describe("AuthProvider boot (L4)", () => {
  beforeEach(() => {
    localStorage.clear();
    meMock.mockReset();
    exchangeMock.mockReset();
    logoutMock.mockReset();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("paints the cached session before the server answers, then believes the answer", async () => {
    seedSession({ role: "admin", player_id: 3 });
    meMock.mockResolvedValue(sessionFixture({ role: "editor", player_id: 3 }));
    mount();

    // The very first frame: authed from cache, no request awaited.
    expect(probe()).toBe("authed:admin:3");
    await waitFor(() => expect(probe()).toBe("authed:editor:3"));
    expect(JSON.parse(localStorage.getItem(ME_STORAGE_KEY) ?? "{}")).toMatchObject({ role: "editor" });
  });

  it("keeps the session when the /me request never reached the server", async () => {
    seedSession({ role: "admin" });
    meMock.mockRejectedValue(networkError());
    mount();

    await waitFor(() => expect(meMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(probe()).toBe("authed:admin:1");
    expect(localStorage.getItem(ME_STORAGE_KEY)).not.toBeNull();
  });

  it("keeps the session when the request was aborted, and when the server is having a bad day", async () => {
    seedSession();
    meMock.mockRejectedValueOnce(new DOMException("The user aborted a request.", "AbortError"));
    const first = mount();
    await waitFor(() => expect(meMock).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(probe()).toBe("authed:editor:1");
    first.unmount();

    meMock.mockRejectedValueOnce(new ApiError(503, "Service Unavailable", ""));
    mount();
    await waitFor(() => expect(meMock).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(probe()).toBe("authed:editor:1");
  });

  it("does not throw a session away over a 403 — that is 'not a member', not 'not logged in'", async () => {
    seedSession();
    meMock.mockRejectedValue(new ApiError(403, "Forbidden", '{"detail":"Not a member of this group"}'));
    mount();
    await waitFor(() => expect(meMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(probe()).toBe("authed:editor:1");
  });

  it("ends the session when the server rejects it (401), and says why", async () => {
    seedSession();
    meMock.mockRejectedValue(new ApiError(401, "Unauthorized", '{"detail":"Not logged in"}'));
    mount();

    await waitFor(() => expect(probe()).toBe("anonymous:none:-"));
    expect(localStorage.getItem(ME_STORAGE_KEY)).toBeNull();
    expect(flags()).toBe("reachable:expired");
  });

  it("is `unknown`, not anonymous, with nothing cached and no answer — and says the server is unreachable", async () => {
    meMock.mockRejectedValue(networkError());
    mount();

    expect(probe()).toBe("unknown:none:-");
    await waitFor(() => expect(flags()).toBe("unreachable:-"));
    expect(probe()).toBe("unknown:none:-");
  });

  it("is anonymous with nothing cached and a 401 — a cold boot, so nothing has 'expired'", async () => {
    meMock.mockRejectedValue(new ApiError(401, "Unauthorized", ""));
    mount();
    await waitFor(() => expect(probe()).toBe("anonymous:none:-"));
    expect(flags()).toBe("reachable:-");
  });

  it("asks again while unknown when the network comes back", async () => {
    meMock.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(sessionFixture());
    mount();
    await waitFor(() => expect(flags()).toBe("unreachable:-"));

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(probe()).toBe("authed:editor:1"));
    expect(meMock).toHaveBeenCalledTimes(2);
  });

  it("a 401 from any request while authed ends the session (api:unauthorized)", async () => {
    seedSession();
    meMock.mockResolvedValue(sessionFixture());
    mount();
    await waitFor(() => expect(meMock).toHaveBeenCalled());

    act(() => {
      window.dispatchEvent(new CustomEvent("api:unauthorized"));
    });
    await waitFor(() => expect(probe()).toBe("anonymous:none:-"));
    expect(flags()).toBe("reachable:expired");
  });

  it("logs out through the server and forgets the session", async () => {
    seedSession();
    meMock.mockResolvedValue(sessionFixture());
    logoutMock.mockResolvedValue({ ok: true });
    mount();
    await waitFor(() => expect(meMock).toHaveBeenCalled());

    screen.getByRole("button", { name: "out" }).click();
    await waitFor(() => expect(probe()).toBe("anonymous:none:-"));
    expect(logoutMock).toHaveBeenCalledWith(null);
    expect(localStorage.getItem(ME_STORAGE_KEY)).toBeNull();
    // The reader chose this: no "expired" line on the login screen.
    expect(flags()).toBe("reachable:-");
  });
});

describe("the old token buys one session (the exchange)", () => {
  beforeEach(() => {
    localStorage.clear();
    meMock.mockReset();
    exchangeMock.mockReset();
    localStorage.setItem("ea_fc_token", "old-jwt");
    localStorage.setItem("ea_fc_role", "admin");
    localStorage.setItem("ea_fc_player_id", "1");
    localStorage.setItem("ea_fc_player_name", "Roli");
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("exchanges it exactly once, caches the answer and removes every legacy key", async () => {
    exchangeMock.mockResolvedValue(sessionFixture({ role: "admin" }));
    mount();

    await waitFor(() => expect(probe()).toBe("authed:admin:1"));
    expect(exchangeMock).toHaveBeenCalledTimes(1);
    expect(exchangeMock).toHaveBeenCalledWith("old-jwt");
    expect(meMock).not.toHaveBeenCalled();
    for (const key of ["ea_fc_token", "ea_fc_role", "ea_fc_player_id", "ea_fc_player_name"]) {
      expect(localStorage.getItem(key), key).toBeNull();
    }
    expect(localStorage.getItem(ME_STORAGE_KEY)).not.toBeNull();
  });

  it("boots `unknown` while a legacy token is stored, even beside a cached session", async () => {
    // The shell must not mount on the old cookie while the exchange is about to revoke
    // it: every request it fired would 401 and end the session the exchange just minted.
    seedSession();
    exchangeMock.mockResolvedValue(sessionFixture({ role: "admin" }));
    mount();
    expect(probe()).toBe("unknown:none:-");
    await waitFor(() => expect(probe()).toBe("authed:admin:1"));
    expect(meMock).not.toHaveBeenCalled();
  });

  it("keeps the token for the next boot when the exchange never reached the server", async () => {
    exchangeMock.mockRejectedValue(networkError());
    mount();

    await waitFor(() => expect(flags()).toBe("unreachable:-"));
    expect(probe()).toBe("unknown:none:-");
    expect(localStorage.getItem("ea_fc_token")).toBe("old-jwt");
    expect(meMock).not.toHaveBeenCalled();
  });

  it("drops a token the server refuses (401) and (410, the exchange is over) and asks /me instead", async () => {
    exchangeMock.mockRejectedValueOnce(new ApiError(410, "Gone", ""));
    meMock.mockRejectedValue(new ApiError(401, "Unauthorized", ""));
    mount();

    await waitFor(() => expect(probe()).toBe("anonymous:none:-"));
    expect(localStorage.getItem("ea_fc_token")).toBeNull();
    expect(meMock).toHaveBeenCalledTimes(1);
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
      meMock.mockRejectedValue(networkError());
      mount();
      expect(probe()).toBe("unknown:none:-");
    } finally {
      spy.mockRestore();
      setSpy.mockRestore();
    }
  });
});
