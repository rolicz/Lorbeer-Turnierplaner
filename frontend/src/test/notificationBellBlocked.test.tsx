import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import NotificationBell from "../ui/shell/NotificationBell";
import { PUSH_BLOCKED_HINT, PUSH_BLOCKED_TITLE } from "../push/pushSetup";
import type { PushSetupState } from "../push/pushSetup";
import type { MyNotificationsResponse } from "../api/types";

/**
 * Q-E: a device whose notification permission is denied says so **in the bell**, for as
 * long as it stays denied — Roli's ask on 2026-09-23, overruling P5's silence.
 *
 * What is asserted here is the contract the top bar depends on (Q13): one control, one
 * size, and a mark that cannot be read as the unread count.
 */
let setupState: PushSetupState = "ok";
vi.mock("../push/usePushNotifications", () => ({
  usePushNotifications: () => ({ setupState }),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ token: "tok" }),
}));

let payload: MyNotificationsResponse = { items: [], unread_count: 0 };
vi.mock("../api/notifications.api", () => ({
  listMyNotifications: () => Promise.resolve(payload),
}));

function renderBell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const button = () => screen.getByRole("button", { name: /Notifications/ });

const ONE_UNREAD: MyNotificationsResponse = {
  unread_count: 1,
  items: [
    {
      kind: "poke",
      id: 7,
      author_name: "Berni",
      snippet: "poked you",
      created_at: "2026-09-23T10:00:00",
      path: "/profiles/1",
    },
  ],
};

describe("NotificationBell, blocked device (Q-E)", () => {
  beforeEach(() => {
    setupState = "ok";
    payload = { items: [], unread_count: 0 };
  });

  it("wears no mark while this device can be pushed to", async () => {
    renderBell();
    await waitFor(() => expect(button()).toBeInTheDocument());
    expect(button()).not.toHaveAttribute("data-push-blocked");
    expect(button()).toHaveAttribute("title", "Notifications");
  });

  it("marks the bell itself when the permission is denied", async () => {
    setupState = "blocked";
    renderBell();
    await waitFor(() => expect(button()).toHaveAttribute("data-push-blocked", "1"));
    expect(button()).toHaveAttribute("title", PUSH_BLOCKED_TITLE);
    expect(button().getAttribute("aria-label")).toContain(PUSH_BLOCKED_TITLE);
  });

  it("keeps the mark out of the count's way — the two say different things", async () => {
    setupState = "blocked";
    payload = ONE_UNREAD;
    renderBell();
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    // The count is still the count, and the accessible name carries both facts.
    expect(button().getAttribute("aria-label")).toBe(`Notifications (1 unread) — ${PUSH_BLOCKED_TITLE}`);
    expect(button()).toHaveAttribute("data-push-blocked", "1");
  });

  it("says where to go once the list is open, and offers no button that would do nothing", async () => {
    setupState = "blocked";
    renderBell();
    await waitFor(() => expect(button()).toHaveAttribute("data-push-blocked", "1"));
    button().click();

    await waitFor(() => expect(screen.getByText(PUSH_BLOCKED_TITLE)).toBeInTheDocument());
    expect(screen.getByText(PUSH_BLOCKED_HINT)).toBeInTheDocument();
    // The browser will never prompt again, so nothing here may claim it can turn push on.
    expect(screen.queryByRole("button", { name: /turn on/i })).toBeNull();
    // And it is not dismissible: there is nothing to press but the bell itself.
    expect(screen.queryByRole("button", { name: /dismiss|not now/i })).toBeNull();
  });

  it("keeps the list to itself when the device is fine", async () => {
    renderBell();
    await waitFor(() => expect(button()).toBeInTheDocument());
    button().click();
    await waitFor(() => expect(screen.getByText("Notifications")).toBeInTheDocument());
    expect(screen.queryByText(PUSH_BLOCKED_TITLE)).toBeNull();
  });
});
