/**
 * Settings → Account (L7): my devices, my password, my groups. The current device is
 * marked and cannot be signed out from its own list; the password editor is in place
 * (read view or editor); the migrated line shows only for a migrated password; "Join"
 * posts the raw code whatever was typed.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import type { AuthSession } from "../api/types";
import { sessionFixture } from "./authFixtures";

const api = vi.hoisted(() => ({
  listMySessions: vi.fn(),
  revokeMySession: vi.fn(),
  revokeMyOthers: vi.fn(),
  changePassword: vi.fn(),
  removePassword: vi.fn(),
  redeemCode: vi.fn(),
}));
vi.mock("../api/account.api", () => api);

const auth = vi.hoisted(() => ({
  hasPassword: true,
  hasPasskey: false,
  passwordMigrated: false,
  groups: [{ id: 1, slug: "altherren", name: "Altherren", role: "member" as const }],
  refresh: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth }));

import SecuritySection from "../pages/settings/SecuritySection";

const SESSIONS: AuthSession[] = [
  { id: 7, kind: "password", device_label: "Linux · Chrome", created_at: "2026-09-20T10:00:00", last_seen_at: "2026-09-23T10:00:00", current: true },
  { id: 3, kind: "password", device_label: "iPhone · Safari", created_at: "2026-09-01T10:00:00", last_seen_at: "2026-09-22T10:00:00", current: false },
];

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SecuritySection />
    </QueryClientProvider>,
  );
}

function rowOf(label: string): HTMLElement {
  const el = screen.getByText(label).closest(".row");
  if (!el) throw new Error(`no row for ${label}`);
  return el as HTMLElement;
}

describe("SecuritySection", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.listMySessions.mockResolvedValue(SESSIONS);
    auth.hasPassword = true;
    auth.passwordMigrated = false;
    auth.refresh.mockReset().mockResolvedValue(undefined);
  });

  it("marks this device and offers no sign-out for it", async () => {
    mount();
    await screen.findByText("Linux · Chrome");
    const current = rowOf("Linux · Chrome");
    expect(within(current).getByText("this device")).toBeTruthy();
    expect(within(current).queryByRole("button")).toBeNull();
    const other = rowOf("iPhone · Safari");
    expect(within(other).queryByText("this device")).toBeNull();
    expect(within(other).getByRole("button", { name: "Sign out iPhone · Safari" })).toBeTruthy();
  });

  it("asks before signing another device out, then revokes that one", async () => {
    api.revokeMySession.mockResolvedValue({ ok: true });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out iPhone · Safari" }));
    expect(api.revokeMySession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(api.revokeMySession).toHaveBeenCalledWith(3));
  });

  it("signs the other devices out after asking, and hides the action when there are none", async () => {
    api.revokeMyOthers.mockResolvedValue({ revoked: 1 });
    const { unmount } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out other devices" }));
    // The trigger and the dialog's verb share their words; the dialog's comes second.
    const buttons = screen.getAllByRole("button", { name: "Sign out other devices" });
    expect(buttons).toHaveLength(2);
    expect(api.revokeMyOthers).not.toHaveBeenCalled();
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(api.revokeMyOthers).toHaveBeenCalledTimes(1));
    unmount();

    api.listMySessions.mockResolvedValue([SESSIONS[0]]);
    mount();
    await screen.findByText("Linux · Chrome");
    expect(screen.queryByRole("button", { name: "Sign out other devices" })).toBeNull();
  });

  it("opens the password editor in place and closes it with the same toggle, discarding the draft", () => {
    mount();
    const toggle = screen.getByRole("button", { name: /change password/i });
    expect(screen.queryByLabelText("New password")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "draft-draft" } });
    fireEvent.click(toggle);
    expect(screen.queryByLabelText("New password")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByLabelText<HTMLInputElement>("New password").value).toBe("");
  });

  it("sends the current password, and shows a wrong one as the server's line", async () => {
    api.changePassword.mockRejectedValueOnce(new ApiError(403, "Forbidden", '{"detail":"The current password is wrong"}'));
    mount();
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "verify-only" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    const save = screen.getByRole<HTMLButtonElement>("button", { name: "Save" });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-longer-password" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("The current password is wrong"));
    expect(api.changePassword).toHaveBeenCalledWith({ current_password: "verify-only", new_password: "a-longer-password" });
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it("changes the password, closes the editor and asks /me again", async () => {
    api.changePassword.mockResolvedValue(sessionFixture());
    mount();
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "verify-only" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-longer-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(auth.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(screen.getByText(/Password changed/)).toBeTruthy();
  });

  it("counts a 429 down instead of showing an error", async () => {
    api.changePassword.mockRejectedValue(new ApiError(429, "Too Many Requests", '{"detail":{"retry_after":42}}', 42));
    mount();
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-longer-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText(/try again in 42s/)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Save" }).disabled).toBe(true);
  });

  it("offers 'Set a password' without a current field to an account that has none", async () => {
    auth.hasPassword = false;
    api.changePassword.mockResolvedValue(sessionFixture());
    mount();
    fireEvent.click(screen.getByRole("button", { name: /set a password/i }));
    expect(screen.queryByLabelText("Current password")).toBeNull();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-longer-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith({ new_password: "a-longer-password" }));
  });

  it("shows the migrated line iff the password is the migrated one", () => {
    const { container, unmount } = mount();
    expect(container.querySelector("[data-password-migrated]")).toBeNull();
    unmount();
    auth.passwordMigrated = true;
    const second = mount();
    expect(second.container.querySelector("[data-password-migrated]")?.textContent).toBe(
      "This is the password you were given — change it, or add a passkey.",
    );
  });

  it("lists my groups with their role", () => {
    mount();
    expect(within(rowOf("Altherren")).getByText("member")).toBeTruthy();
  });

  it("formats the code as it is typed and posts the raw eight characters", async () => {
    api.redeemCode.mockResolvedValue(
      sessionFixture({ groups: [...auth.groups, { id: 2, slug: "jungs", name: "Jungs", role: "member" }] }),
    );
    mount();
    const field = screen.getByLabelText<HTMLInputElement>("Invite code");
    fireEvent.change(field, { target: { value: "abcd efgh" } });
    expect(field.value).toBe("ABCD-EFGH");
    fireEvent.change(field, { target: { value: "o0i1" } });
    expect(field.value).toBe("");
    fireEvent.change(field, { target: { value: "abcd efgh" } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(api.redeemCode).toHaveBeenCalledWith("ABCDEFGH"));
    await waitFor(() => expect(screen.getByText("You joined Jungs.")).toBeTruthy());
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a bad code as the server's one message", async () => {
    api.redeemCode.mockRejectedValue(new ApiError(400, "Bad Request", '{"detail":"That code is not valid"}'));
    mount();
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "ZZZZZZZZ" } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That code is not valid"));
    expect(auth.refresh).not.toHaveBeenCalled();
  });
});
