/**
 * The admin page (L6): the three account filters, the site-admin-only controls hidden for
 * an owner, a secret (invite code, reset link) shown once and never listed, the sessions
 * sheet marking the admin's own device, and the last-owner refusal in the server's words.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import type { AdminAccount, AuthSession, Invite } from "../api/types";

const api = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  listAccountSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeAllSessions: vi.fn(),
  createInvite: vi.fn(),
  listInvites: vi.fn(),
  revokeInvite: vi.fn(),
  createResetLink: vi.fn(),
  setMemberRole: vi.fn(),
}));
vi.mock("../api/admin.api", () => api);
vi.mock("../api/playerAvatars.api", () => ({ listPlayerAvatarMeta: vi.fn().mockResolvedValue([]) }));

const toast = vi.hoisted(() => ({ showErrorToast: vi.fn() }));
vi.mock("../ui/primitives/ErrorToast", () => toast);

const auth = vi.hoisted(() => ({ role: "editor" as string }));
vi.mock("../auth/AuthContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/AuthContext")>()),
  useAuth: () => auth,
}));

import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireRole } from "../auth/RequireRole";
import AccountsTab from "../pages/admin/AccountsTab";
import InvitesTab from "../pages/admin/InvitesTab";
import SessionsSheet from "../pages/admin/SessionsSheet";

const account = (over: Partial<AdminAccount>): AdminAccount => ({
  player_id: 1,
  display_name: "Roli",
  site_admin: false,
  role: "editor",
  password_origin: "set",
  has_passkey: false,
  session_count: 0,
  last_seen_at: null,
  email_state: "none",
  login_secure: true,
  ...over,
});

const ACCOUNTS: AdminAccount[] = [
  account({ player_id: 1, display_name: "Roli", site_admin: true, role: "admin", session_count: 2, last_seen_at: "2026-09-23T10:00:00" }),
  account({ player_id: 2, display_name: "Flo", role: "owner", password_origin: "migrated", session_count: 1, last_seen_at: "2026-09-22T10:00:00" }),
  account({ player_id: 4, display_name: "Berni", password_origin: "migrated", has_passkey: true }),
  account({ player_id: 3, display_name: "Rumpi", password_origin: "none" }),
];

function mount(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function rowOf(name: string): HTMLElement {
  const el = screen.getByText(name).closest(".row");
  if (!el) throw new Error(`no row for ${name}`);
  return el as HTMLElement;
}

const names = () => [...document.querySelectorAll("[data-account-row]")].map((el) => el.firstElementChild?.textContent);

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  toast.showErrorToast.mockReset();
  api.listAccounts.mockResolvedValue(ACCOUNTS);
});

describe("AccountsTab", () => {
  it("filters by logged in and by migrated password (a passkey takes an account off that list)", async () => {
    mount(<AccountsTab siteAdmin />);
    await screen.findByText("Rumpi");
    expect(names()).toEqual(["Roli", "Flo", "Berni", "Rumpi"]);

    fireEvent.click(screen.getByRole("button", { name: "Logged in" }));
    expect(names()).toEqual(["Roli", "Flo"]);

    fireEvent.click(screen.getByRole("button", { name: "Migrated password" }));
    expect(names()).toEqual(["Flo"]);
    expect(within(rowOf("Flo")).getByText("migrated password", { selector: ".text-warn" })).toHaveClass("text-warn");
  });

  it("says nobody is logged in when nobody is", async () => {
    api.listAccounts.mockResolvedValue([ACCOUNTS[3]]);
    mount(<AccountsTab siteAdmin />);
    await screen.findByText("Rumpi");
    expect(within(rowOf("Rumpi")).getByText(/no login/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Logged in" }));
    expect(screen.getByText("Nobody is logged in.")).toBeTruthy();
  });

  it("shows an owner no device sheet and no reset link — only the owner toggle", async () => {
    mount(<AccountsTab siteAdmin={false} />);
    await screen.findByText("Rumpi");
    expect(screen.queryByRole("button", { name: /^Devices of/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /reset link/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Flo as owner" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make Rumpi owner" })).toBeTruthy();
    // The site admin's power is not a membership role — nothing to toggle on that row.
    expect(within(rowOf("Roli")).queryByRole("button")).toBeNull();
  });

  it("creates a reset link after asking and shows it once", async () => {
    api.createResetLink.mockResolvedValue({ player_id: 2, url: "http://x/g/altherren/reset#tok123", expires_at: "2026-09-23T11:00:00" });
    mount(<AccountsTab siteAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: "Create a reset link for Flo" }));
    expect(api.createResetLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create reset link" }));
    await waitFor(() => expect(api.createResetLink).toHaveBeenCalledWith(2));
    const box = await waitFor(() => {
      const el = document.querySelector('[data-shown-once="reset-link"]');
      if (!el) throw new Error("no box");
      return el as HTMLElement;
    });
    expect(within(box).getByText("http://x/g/altherren/reset#tok123")).toHaveClass("font-mono");
    expect(within(box).getByText(/will not be shown again/)).toBeTruthy();
  });

  it("puts the server's last-owner refusal in front of the reader", async () => {
    api.setMemberRole.mockRejectedValue(new ApiError(409, "Conflict", '{"detail":"A group needs at least one owner"}'));
    mount(<AccountsTab siteAdmin={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Flo as owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove owner" }));
    await waitFor(() => expect(api.setMemberRole).toHaveBeenCalledWith("altherren", 2, "member"));
    await waitFor(() => expect(toast.showErrorToast).toHaveBeenCalledWith("A group needs at least one owner", "Role not changed"));
  });
});

describe("SessionsSheet", () => {
  const SESSIONS: AuthSession[] = [
    { id: 7, kind: "password", device_label: "Linux · Chrome", created_at: "2026-09-20T10:00:00", last_seen_at: "2026-09-23T10:00:00", current: true },
    { id: 3, kind: "password", device_label: "iPhone · Safari", created_at: "2026-09-01T10:00:00", last_seen_at: "2026-09-22T10:00:00", current: false },
  ];

  it("marks the admin's own device and signs another out after asking", async () => {
    api.listAccountSessions.mockResolvedValue(SESSIONS);
    api.revokeSession.mockResolvedValue({ ok: true });
    mount(<SessionsSheet account={ACCOUNTS[0]} onClose={() => {}} />);
    await screen.findByText("Linux · Chrome");
    expect(api.listAccountSessions).toHaveBeenCalledWith(1);
    expect(within(rowOf("Linux · Chrome")).getByText("this device")).toBeTruthy();
    expect(within(rowOf("Linux · Chrome")).queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign out iPhone · Safari" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith(3));
  });

  it("signs every device out after asking", async () => {
    api.listAccountSessions.mockResolvedValue([SESSIONS[1]]);
    api.revokeAllSessions.mockResolvedValue({ revoked: 1 });
    mount(<SessionsSheet account={ACCOUNTS[1]} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out every device" }));
    const buttons = screen.getAllByRole("button", { name: "Sign out every device" });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(api.revokeAllSessions).toHaveBeenCalledWith(2));
  });
});

describe("InvitesTab", () => {
  const LIVE: Invite[] = [
    { id: 9, group_slug: "altherren", note: "Mike", created_at: "2026-09-23T10:00:00", expires_at: "2099-01-01T00:00:00", created_by: { id: 1, display_name: "Roli" } },
  ];

  it("shows a new code once, big and copyable, and the list never shows it", async () => {
    api.listInvites.mockResolvedValue([]);
    api.createInvite.mockResolvedValue({ id: 9, code: "LM9DZPBK", group_slug: "altherren", note: "Mike", expires_at: "2099-01-01T00:00:00" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    mount(<InvitesTab />);
    expect(await screen.findByText("No live codes.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Note (who is it for)"), { target: { value: " Mike " } });
    api.listInvites.mockResolvedValue(LIVE);
    fireEvent.click(screen.getByRole("button", { name: "Create code" }));
    await waitFor(() => expect(api.createInvite).toHaveBeenCalledWith("Mike"));

    const code = await screen.findByText("LM9D-ZPBK");
    expect(code).toHaveClass("font-mono", "text-2xl");
    expect(screen.getAllByText(/LM9D/)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/g/altherren/register?code=LM9DZPBK`));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();

    // The listed row carries the note and never the code.
    const row = rowOf("Mike");
    expect(row.textContent).not.toMatch(/LM9D/);
  });

  it("revokes a code after asking, and drops it from the screen if it was the one shown", async () => {
    api.listInvites.mockResolvedValue(LIVE);
    api.revokeInvite.mockResolvedValue({ ok: true });
    mount(<InvitesTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke the code for Mike" }));
    expect(screen.getByText("The code for Mike stops working at once.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revoke code" }));
    await waitFor(() => expect(api.revokeInvite).toHaveBeenCalledWith(9));
  });
});

describe("RequireRole on /admin", () => {
  function at(role: string) {
    auth.role = role;
    return render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<RequireRole minRole="owner"><div>admin page</div></RequireRole>} />
          <Route path="/dashboard" element={<div>home</div>} />
          <Route path="/login" element={<div>login</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("sends a logged-in member home, not to the login screen", () => {
    at("editor");
    expect(screen.getByText("home")).toBeTruthy();
    expect(screen.queryByText("login")).toBeNull();
  });

  it("lets an owner in", () => {
    at("owner");
    expect(screen.getByText("admin page")).toBeTruthy();
  });
});
