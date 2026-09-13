import { describe, expect, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";

import { ErrorToastViewport, showErrorToast } from "../ui/primitives/ErrorToast";

// showErrorToast dispatches a window event that the viewport listens for, so the
// state update happens outside React's event system -> wrap it in act().
function toast(message: string, title?: string) {
  act(() => {
    showErrorToast(message, title);
  });
}

describe("ErrorToastViewport", () => {
  it("renders nothing until a toast is dispatched", () => {
    const { container } = render(<ErrorToastViewport />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a dispatched toast with its title and message", () => {
    const { getByText } = render(<ErrorToastViewport />);
    toast("boom", "Oops");
    expect(getByText("Oops")).toBeInTheDocument();
    expect(getByText("boom")).toBeInTheDocument();
  });

  it("ignores an identical repeat inside the dedupe window", () => {
    const { getAllByText } = render(<ErrorToastViewport />);
    toast("double trouble", "Dupe");
    toast("double trouble", "Dupe");
    expect(getAllByText("double trouble")).toHaveLength(1);
  });

  it("stacks distinct toasts", () => {
    const { getByText } = render(<ErrorToastViewport />);
    toast("first problem", "A");
    toast("second problem", "B");
    expect(getByText("first problem")).toBeInTheDocument();
    expect(getByText("second problem")).toBeInTheDocument();
  });

  it("drops empty messages", () => {
    const { container } = render(<ErrorToastViewport />);
    toast("   ", "Blank");
    expect(container).toBeEmptyDOMElement();
  });

  it("dismisses a toast via its close button", () => {
    const { getByTitle, queryByText } = render(<ErrorToastViewport />);
    toast("go away", "Bye");
    fireEvent.click(getByTitle("Dismiss"));
    expect(queryByText("go away")).not.toBeInTheDocument();
  });
});
