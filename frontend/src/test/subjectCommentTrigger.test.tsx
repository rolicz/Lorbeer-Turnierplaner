import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import SubjectCommentTrigger from "../pages/profile/SubjectCommentTrigger";

describe("SubjectCommentTrigger", () => {
  it("shows nothing to a reader with nothing to read", () => {
    const { container } = render(
      <SubjectCommentTrigger kind="header_image" count={0} canPost={false} onOpen={() => {}} />,
    );
    expect(container.querySelector("[data-subject-trigger]")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("shows a reader the count, and opens on a click", () => {
    const onOpen = vi.fn();
    render(<SubjectCommentTrigger kind="header_image" count={2} canPost={false} onOpen={onOpen} />);

    const btn = screen.getByRole("button", { name: "2 comments on the header image" });
    expect(btn.textContent).toContain("2 comments");
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith("header_image");
  });

  it("invites someone who can post, even at zero", () => {
    render(<SubjectCommentTrigger kind="about" count={0} canPost onOpen={() => {}} />);
    const btn = screen.getByRole("button", { name: "Comment on the About text" });
    expect(btn.textContent).toContain("Comment");
    expect(btn.getAttribute("title")).toBe("Comment on the About text");
  });

  it("names the subject in the title of each kind", () => {
    for (const [kind, noun] of [
      ["header_image", "the header image"],
      ["about", "the About text"],
      ["avatar", "the avatar"],
    ] as const) {
      const { container, unmount } = render(
        <SubjectCommentTrigger kind={kind} count={0} canPost onOpen={() => {}} />,
      );
      expect(container.querySelector("[data-subject-trigger]")?.getAttribute("title")).toBe(`Comment on ${noun}`);
      unmount();
    }
  });

  it("is a button, never a link", () => {
    const { container } = render(
      <SubjectCommentTrigger kind="avatar" count={3} canPost onOpen={() => {}} />,
    );
    expect(container.querySelectorAll("a").length).toBe(0);
    expect(container.querySelector("[data-subject-trigger]")?.tagName).toBe("BUTTON");
  });

  it("the overlay badge says nothing at zero, whoever is looking", () => {
    for (const canPost of [true, false]) {
      const { container, unmount } = render(
        <SubjectCommentTrigger kind="header_image" count={0} canPost={canPost} variant="overlay" onOpen={() => {}} />,
      );
      expect(container.querySelector("[data-subject-trigger]")).toBeNull();
      unmount();
    }
  });

  it("the overlay badge is the bare count, and opens the same composer", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <SubjectCommentTrigger
        kind="header_image"
        count={2}
        canPost
        variant="overlay"
        onOpen={onOpen}
        className="absolute bottom-2 right-2"
      />,
    );
    const btn = container.querySelector('[data-subject-trigger-variant="overlay"]') as HTMLElement;
    expect(btn).toBeTruthy();
    // A marker, not prose: the number alone, with the sentence in the accessible name.
    expect(btn.textContent).toBe("2");
    expect(btn.getAttribute("aria-label")).toBe("2 comments on the header image");
    // It may never take part in the header's flow (M8/M9).
    expect(btn.className).toContain("absolute");
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith("header_image");
  });
});
