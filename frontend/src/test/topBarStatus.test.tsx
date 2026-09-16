import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

import TopBarStatus from "../ui/shell/TopBarStatus";
import { RealtimeStatusProvider } from "../ui/RealtimeStatusProvider";
import type { RealtimeStatus } from "../ui/RealtimeStatusContext";

/**
 * Q13: the mobile top bar's right slot holds exactly one 40px control, so the
 * centred title can never be shoved — the connection marker *replaces* the bell
 * instead of standing beside it. T10's grace survives, and gained a mirror:
 * the slot changes at most every 1.2 s in either direction.
 *
 * The bell itself is stubbed: this is about which control owns the slot, and
 * the real one needs a session, a query client and a router to say anything.
 */
vi.mock("../ui/shell/NotificationBell", () => ({
  default: ({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) => (
    <button type="button" aria-label="Notifications" onClick={() => onOpenChange?.(true)}>
      bell
    </button>
  ),
}));

function Harness({ status }: { status: RealtimeStatus }) {
  return (
    <RealtimeStatusProvider status={status}>
      <TopBarStatus />
    </RealtimeStatusProvider>
  );
}

const marker = () => document.querySelector("[data-connection-status]");
const bell = () => screen.queryByRole("button", { name: "Notifications" });

describe("TopBarStatus (Q13)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is the bell while the socket is up", () => {
    render(<Harness status="live" />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(bell()).not.toBeNull();
    expect(marker()).toBeNull();
  });

  it("keeps the bell through the startup handshake", () => {
    render(<Harness status="reconnecting" />);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(bell()).not.toBeNull();
    expect(marker()).toBeNull();
  });

  it("swaps the bell for the marker once the connection is really gone", () => {
    render(<Harness status="reconnecting" />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(bell()).toBeNull();
    expect(marker()).toHaveAttribute("data-connection-status", "reconnecting");
    // The words survive as the marker's accessible name, not as layout.
    expect(screen.getByText("Realtime status: Reconnecting")).toBeInTheDocument();
  });

  it("holds the slot for a beat after recovery instead of blinking", () => {
    const view = render(<Harness status="reconnecting" />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(marker()).not.toBeNull();

    view.rerender(<Harness status="live" />);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(marker(), "still the marker 0.6s after recovery").not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(marker()).toBeNull();
    expect(bell()).not.toBeNull();
  });

  it("follows a state change without a second grace period", () => {
    const view = render(<Harness status="reconnecting" />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    view.rerender(<Harness status="offline" />);
    expect(marker()).toHaveAttribute("data-connection-status", "offline");
    expect(screen.getByText("Realtime status: Offline")).toBeInTheDocument();
  });

  it("does not take the slot away from an open notification list", () => {
    const view = render(<Harness status="live" />);
    act(() => {
      screen.getByRole("button", { name: "Notifications" }).click();
    });

    view.rerender(<Harness status="reconnecting" />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(bell(), "the popover is open, so the bell keeps the slot").not.toBeNull();
    expect(marker()).toBeNull();
  });
});
