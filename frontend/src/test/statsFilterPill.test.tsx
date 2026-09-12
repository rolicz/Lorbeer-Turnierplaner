import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import StatsFilterPill from "../pages/stats/StatsFilterPill";

function setup(props: Partial<ComponentProps<typeof StatsFilterPill>> = {}) {
  const onModeChange = vi.fn();
  const onScopeChange = vi.fn();
  const utils = render(
    <StatsFilterPill
      mode="overall"
      scope="tournaments"
      onModeChange={onModeChange}
      onScopeChange={onScopeChange}
      showMode
      showScope
      {...props}
    />,
  );
  return { ...utils, onModeChange, onScopeChange };
}

describe("StatsFilterPill", () => {
  it("renders both native selects with the current values", () => {
    const { getByLabelText } = setup({ mode: "1v1", scope: "both" });
    const modeSelect = getByLabelText("Mode") as HTMLSelectElement;
    const scopeSelect = getByLabelText("Source") as HTMLSelectElement;
    expect(modeSelect.tagName).toBe("SELECT");
    expect(scopeSelect.tagName).toBe("SELECT");
    expect(modeSelect.value).toBe("1v1");
    expect(scopeSelect.value).toBe("both");
  });

  it("offers the three mode and three source options", () => {
    const { getByLabelText } = setup();
    const modeOptions = Array.from((getByLabelText("Mode") as HTMLSelectElement).options).map((o) => o.value);
    const scopeOptions = Array.from((getByLabelText("Source") as HTMLSelectElement).options).map((o) => o.value);
    expect(modeOptions).toEqual(["overall", "1v1", "2v2"]);
    expect(scopeOptions).toEqual(["tournaments", "both", "friendlies"]);
  });

  it("reports a mode change", () => {
    const { getByLabelText, onModeChange, onScopeChange } = setup();
    fireEvent.change(getByLabelText("Mode"), { target: { value: "2v2" } });
    expect(onModeChange).toHaveBeenCalledWith("2v2");
    expect(onScopeChange).not.toHaveBeenCalled();
  });

  it("reports a source change", () => {
    const { getByLabelText, onModeChange, onScopeChange } = setup();
    fireEvent.change(getByLabelText("Source"), { target: { value: "friendlies" } });
    expect(onScopeChange).toHaveBeenCalledWith("friendlies");
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("hides the source select for sections that only use the mode", () => {
    const { getByLabelText, queryByLabelText } = setup({ showScope: false });
    expect(getByLabelText("Mode")).toBeInTheDocument();
    expect(queryByLabelText("Source")).toBeNull();
  });

  it("hides the mode select when only the source applies", () => {
    const { getByLabelText, queryByLabelText } = setup({ showMode: false });
    expect(getByLabelText("Source")).toBeInTheDocument();
    expect(queryByLabelText("Mode")).toBeNull();
  });

  it("renders nothing when no filter applies (e.g. Cups)", () => {
    const { container } = setup({ showMode: false, showScope: false });
    expect(container).toBeEmptyDOMElement();
  });
});
