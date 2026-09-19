import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import ImageLightbox from "../ui/primitives/ImageLightbox";

// jsdom has no ResizeObserver and the lightbox constructs one unguarded (it measures
// its own viewport to clamp the pan). The no-op stub is enough: nothing here asserts
// on the pan limits.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

describe("ImageLightbox footer", () => {
  it("renders no footer box when no footer is given", () => {
    const { container } = render(<ImageLightbox open src="/x.png" onClose={() => {}} />);
    expect(container.querySelectorAll("[data-lightbox-footer]").length).toBe(0);
  });

  it("closes on a click on the scrim", () => {
    const onClose = vi.fn();
    const { container } = render(
      <ImageLightbox open src="/x.png" onClose={onClose} footer={<button type="button">Comment</button>} />,
    );
    const scrim = container.firstElementChild as HTMLElement;
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on a click on a control inside the footer", () => {
    const onClose = vi.fn();
    const onOpen = vi.fn();
    render(
      <ImageLightbox
        open
        src="/x.png"
        onClose={onClose}
        footer={
          <button type="button" onClick={onOpen}>
            Comment
          </button>
        }
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("puts the footer in the safe box", () => {
    const { container } = render(
      <ImageLightbox open src="/x.png" onClose={() => {}} footer={<button type="button">Comment</button>} />,
    );
    const footer = container.querySelector("[data-lightbox-footer]") as HTMLElement;
    expect(footer).toBeTruthy();
    for (const cls of ["bottom-safe-b", "left-safe-l", "right-safe-r"]) {
      expect(footer.className).toContain(cls);
    }
  });
});
