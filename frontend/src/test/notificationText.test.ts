import { describe, expect, it } from "vitest";

import type { MyNotification } from "../api/types";
import { notificationDetail, notificationHeadline } from "../ui/shell/notificationText";

function notif(over: Partial<MyNotification> = {}): MyNotification {
  return {
    kind: "comment_reply",
    id: 1,
    author_name: "Berni",
    snippet: "",
    created_at: "2026-09-19T10:00:00",
    path: "/live/1",
    ...over,
  };
}

describe("notificationHeadline", () => {
  it("comment_reply", () => {
    expect(notificationHeadline(notif({ kind: "comment_reply", author_name: "Berni" }))).toBe(
      "Berni replied to your comment",
    );
  });

  it("guestbook", () => {
    expect(notificationHeadline(notif({ kind: "guestbook", author_name: "Flo" }))).toBe(
      "Flo wrote on your guestbook",
    );
  });

  it("poke", () => {
    expect(notificationHeadline(notif({ kind: "poke", author_name: "Roli" }))).toBe("Roli poked you");
  });

  it("idea_created", () => {
    expect(notificationHeadline(notif({ kind: "idea_created", author_name: "Berni" }))).toBe(
      "Berni shared an idea",
    );
  });

  it("idea_comment", () => {
    expect(notificationHeadline(notif({ kind: "idea_comment", author_name: "Flo" }))).toBe(
      "Flo commented on your idea",
    );
  });

  it("idea_vote uses Roli's own verb, not the board's 'wants'", () => {
    expect(notificationHeadline(notif({ kind: "idea_vote", author_name: "Roli" }))).toBe(
      "Roli likes your idea",
    );
  });

  it("idea_status labels a known status", () => {
    expect(
      notificationHeadline(notif({ kind: "idea_status", author_name: "Roli", idea_status: "planned" })),
    ).toBe("Roli set your idea to Planned");
  });

  it("idea_status falls back to the raw value for an unknown status", () => {
    expect(
      notificationHeadline(notif({ kind: "idea_status", author_name: "Roli", idea_status: "mystery" })),
    ).toBe("Roli set your idea to mystery");
  });
});

describe("notificationDetail", () => {
  it("the three old kinds show their snippet as-is", () => {
    expect(notificationDetail(notif({ kind: "comment_reply", snippet: "no way" }))).toBe("no way");
    expect(notificationDetail(notif({ kind: "guestbook", snippet: "hi there" }))).toBe("hi there");
    expect(notificationDetail(notif({ kind: "poke", snippet: "" }))).toBe("");
  });

  it("an idea kind with no snippet shows the idea title alone", () => {
    expect(
      notificationDetail(notif({ kind: "idea_created", idea_title: "Dark mode", snippet: "" })),
    ).toBe("Dark mode");
  });

  it("an idea kind with a snippet joins title and snippet with the app separator", () => {
    expect(
      notificationDetail(
        notif({
          kind: "idea_comment",
          idea_title: "Dark mode",
          snippet: "Agreed, and on the dashboard too.",
        }),
      ),
    ).toBe("Dark mode · Agreed, and on the dashboard too.");
  });

  it("idea_vote and idea_status also join title and snippet the same way", () => {
    expect(
      notificationDetail(notif({ kind: "idea_status", idea_title: "Dark mode", snippet: "after FC 27" })),
    ).toBe("Dark mode · after FC 27");
  });
});
