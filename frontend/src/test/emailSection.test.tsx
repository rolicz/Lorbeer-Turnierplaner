/**
 * Settings → Account → Email (E4): the four states off `MeOut` — mail off, none, pending
 * (with or without a verified address beside it), verified — the server's refusals shown
 * verbatim, a 429 counted down, the pending state asking `/me` again when the reader comes
 * back from the link, and removing a stored address behind the red block.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";

const api = vi.hoisted(() => ({
  setEmail: vi.fn(),
  resendEmail: vi.fn(),
  removeEmail: vi.fn(),
}));
vi.mock("../api/account.api", () => api);

const toast = vi.hoisted(() => ({ showErrorToast: vi.fn() }));
vi.mock("../ui/primitives/ErrorToast", () => toast);

const auth = vi.hoisted(() => ({
  email: null as string | null,
  emailPending: null as string | null,
  emailVerified: false,
  emailAvailable: true,
  refresh: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth }));

import EmailSection from "../pages/settings/EmailSection";

const refusal = (status: number, detail: string, retryAfter: number | null = null) =>
  new ApiError(status, "Error", JSON.stringify({ detail }), retryAfter);

function rowOf(label: string): HTMLElement {
  const el = screen.getByText(label).closest(".row");
  if (!el) throw new Error(`no row for ${label}`);
  return el as HTMLElement;
}

function typeAndSend(value: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value } });
  fireEvent.submit(screen.getByRole("form", { name: "Set your email" }));
}

describe("EmailSection", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    toast.showErrorToast.mockReset();
    auth.email = null;
    auth.emailPending = null;
    auth.emailVerified = false;
    auth.emailAvailable = true;
    auth.refresh.mockReset().mockResolvedValue(undefined);
  });

  it("says mail is off and offers no form where the server cannot send", () => {
    auth.emailAvailable = false;
    const { container } = render(<EmailSection />);
    expect(container.querySelector("[data-email-off]")?.textContent).toBe(
      "Email is not set up on this server. If you get locked out, ask the admin for a reset link.",
    );
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("with no address, sends the link to what was typed, says so and asks /me again", async () => {
    api.setEmail.mockResolvedValue({ email: null, email_pending: "roli@example.test", email_verified: false });
    render(<EmailSection />);
    expect(screen.getByText(/A verified email lets you get back in/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send verification link" })).toBeDisabled();
    typeAndSend("  roli@example.test ");
    await waitFor(() => expect(api.setEmail).toHaveBeenCalledWith("roli@example.test"));
    expect(await screen.findByText("Verification link sent to roli@example.test.")).toBeTruthy();
    expect(auth.refresh).toHaveBeenCalled();
  });

  it("shows a 409 in the server's own words", async () => {
    api.setEmail.mockRejectedValue(refusal(409, "That email address is used by another account"));
    render(<EmailSection />);
    typeAndSend("flo@example.test");
    const line = await screen.findByRole("alert");
    expect(line.textContent).toBe("That email address is used by another account");
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it("shows a failed send (502) as its sentence", async () => {
    api.setEmail.mockRejectedValue(refusal(502, "Could not send the email — try again in a moment"));
    render(<EmailSection />);
    typeAndSend("roli@example.test");
    expect((await screen.findByRole("alert")).textContent).toBe("Could not send the email — try again in a moment");
  });

  it("counts a 429 down instead of showing an error, and holds the button", async () => {
    api.setEmail.mockRejectedValue(refusal(429, "Too many attempts", 42));
    render(<EmailSection />);
    typeAndSend("roli@example.test");
    expect(await screen.findByText("Too many attempts — try again in 42s")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Send verification link" })).toBeDisabled();
  });

  it("while pending: the row says pending, the link is explained, and Send again sends it again", async () => {
    auth.emailPending = "roli@example.test";
    api.resendEmail.mockResolvedValue({ email: null, email_pending: "roli@example.test", email_verified: false });
    const { container } = render(<EmailSection />);
    expect(within(rowOf("roli@example.test")).getByText("pending")).toBeTruthy();
    expect(container.querySelector("[data-email-pending]")?.textContent).toMatch(/Check your spam folder too\./);
    expect(screen.queryByLabelText("Email")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    await waitFor(() => expect(api.resendEmail).toHaveBeenCalled());
    expect(await screen.findByText("Verification link sent to roli@example.test.")).toBeTruthy();
  });

  it("while pending, asks /me again when the reader comes back from the link", () => {
    auth.emailPending = "roli@example.test";
    render(<EmailSection />);
    expect(auth.refresh).not.toHaveBeenCalled();
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not ask /me on return when nothing is pending", () => {
    auth.email = "roli@example.test";
    auth.emailVerified = true;
    render(<EmailSection />);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it("lists a verified address above a pending change — the old one still works", () => {
    auth.email = "old@example.test";
    auth.emailVerified = true;
    auth.emailPending = "new@example.test";
    render(<EmailSection />);
    expect(within(rowOf("old@example.test")).getByText("verified")).toBeTruthy();
    expect(within(rowOf("new@example.test")).getByText("pending")).toBeTruthy();
  });

  it("verified: Change opens the field and closes it again, discarding the draft", () => {
    auth.email = "roli@example.test";
    auth.emailVerified = true;
    render(<EmailSection />);
    expect(within(rowOf("roli@example.test")).getByText("verified")).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    const change = screen.getByRole("button", { name: "Change" });
    fireEvent.click(change);
    expect(change).toHaveAttribute("aria-expanded", "true");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "draft@example.test" } });
    fireEvent.click(change);
    expect(screen.queryByLabelText("Email")).toBeNull();
    fireEvent.click(change);
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("removes a verified address only after the red block, then asks /me again", async () => {
    auth.email = "roli@example.test";
    auth.emailVerified = true;
    api.removeEmail.mockResolvedValue({ email: null, email_pending: null, email_verified: false });
    render(<EmailSection />);
    fireEvent.click(screen.getByRole("button", { name: "Remove email" }));
    expect(api.removeEmail).not.toHaveBeenCalled();
    expect(screen.getByText("Remove your email address?")).toBeTruthy();
    const block = screen.getByText("You will not be able to get back in by email until you verify a new one.");
    expect(block.parentElement).toHaveClass("text-error");
    const buttons = screen.getAllByRole("button", { name: "Remove email" });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(api.removeEmail).toHaveBeenCalled());
    await waitFor(() => expect(auth.refresh).toHaveBeenCalled());
  });
});
