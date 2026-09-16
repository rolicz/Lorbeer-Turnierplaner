import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import PageLayout from "../ui/layout/PageLayout";
import ConnectionIndicator from "../ui/shell/ConnectionIndicator";
import { RealtimeStatusProvider } from "../ui/RealtimeStatusProvider";
import type { RealtimeStatus } from "../ui/RealtimeStatusContext";

/**
 * T10: one live indicator, and the same band above every page's first block.
 */
describe("PageLayout (T10 rhythm)", () => {
  const renderAt = (path: string, ui: React.ReactElement) =>
    render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

  it("keeps the desktop title row out of the content column", () => {
    const { container } = renderAt(
      "/tournaments",
      <PageLayout title="Tournaments">
        <div data-testid="first-block">tabs</div>
      </PageLayout>,
    );

    const page = container.querySelector(".page");
    // The title row is a sibling of `.page`, not a (hidden) spacing sibling
    // inside it — that stray rhythm gap was the empty band above the tab strip.
    expect(page?.firstElementChild).toHaveAttribute("data-testid", "first-block");
    expect(container.querySelector("h1")).toBeInTheDocument();
    expect(page?.querySelector("h1")).toBeNull();
  });

  it("renders back, meta and actions in the title row", () => {
    // Q6: the chevron is not a prop any more — the row asks the hierarchy, so a
    // page you went into gets it and a destination does not.
    const { getByText, getByLabelText, container } = renderAt(
      "/live/19",
      <PageLayout title="test 2v2" meta={<span>2v2</span>} actions={<button type="button">act</button>}>
        <div>body</div>
      </PageLayout>,
    );

    const row = container.querySelector("h1")?.parentElement?.parentElement;
    expect(row).toContainElement(getByLabelText("Back"));
    expect(row).toContainElement(getByText("2v2"));
    expect(row).toContainElement(getByText("act"));
  });

  it("renders no chevron on a destination", () => {
    const { queryByLabelText } = renderAt(
      "/tournaments",
      <PageLayout title="Tournaments">
        <div>body</div>
      </PageLayout>,
    );
    expect(queryByLabelText("Back")).toBeNull();
  });

  it("keeps the row for the chevron alone while a page you went into is still loading", () => {
    // The desktop has no top bar, so this row is the only place back can live —
    // a loading or "not found" state must not be the one screen with no way out.
    const { getByLabelText, container } = renderAt(
      "/live/19/match/108",
      <PageLayout>
        <div>loading</div>
      </PageLayout>,
    );
    expect(getByLabelText("Back")).toBeInTheDocument();
    expect(container.querySelector("h1")).toBeNull();
  });

  it("renders no title row without a title", () => {
    const { container } = renderAt(
      "/tournaments",
      <PageLayout>
        <div>body</div>
      </PageLayout>,
    );
    expect(container.querySelector("h1")).toBeNull();
  });
});

describe("ConnectionIndicator (T10)", () => {
  const renderWith = (status: RealtimeStatus) =>
    render(
      <RealtimeStatusProvider status={status}>
        <ConnectionIndicator />
      </RealtimeStatusProvider>,
    );

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says nothing while the socket is up", () => {
    const { container } = renderWith("live");
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("stays quiet during the startup handshake", () => {
    const { container } = renderWith("reconnecting");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("appears once the connection is really gone", () => {
    const { container, getByText } = renderWith("reconnecting");
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(getByText("Reconnecting")).toBeInTheDocument();
    expect(container.querySelector("[data-connection-status]")).toHaveAttribute(
      "data-connection-status",
      "reconnecting",
    );
  });

  it("shows the offline state too", () => {
    const { getByText } = renderWith("offline");
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(getByText("Offline")).toBeInTheDocument();
  });
});
