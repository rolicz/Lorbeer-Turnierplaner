import { describe, it, expect } from "vitest";
import { yAtScale, xAtScale } from "../pages/stats/charts/useChartScaling";
import { buildSeriesSegments, computeLaneOffsets } from "../pages/stats/charts/chartSvg";
import type { SeriesPoint } from "../pages/stats/trendsMath";

// Fixed viewBox constants matching TrendsChart.tsx defaults.
const H = 520;
const W = 920;
const PAD_T = 14;
const PAD_B = 86;
const PAD_L = 56;
const PAD_R = 14;

describe("yAtScale", () => {
  it("maps 0 to the bottom of the inner area", () => {
    const y = yAtScale(0, 100, H, PAD_T, PAD_B);
    expect(y).toBeCloseTo(PAD_T + (H - PAD_T - PAD_B));
  });

  it("maps yMax to the top of the inner area (padT)", () => {
    const y = yAtScale(100, 100, H, PAD_T, PAD_B);
    expect(y).toBeCloseTo(PAD_T);
  });

  it("maps the midpoint to the vertical center", () => {
    const y = yAtScale(50, 100, H, PAD_T, PAD_B);
    const center = PAD_T + (H - PAD_T - PAD_B) / 2;
    expect(y).toBeCloseTo(center);
  });

  it("clamps values below 0 to the bottom", () => {
    expect(yAtScale(-10, 100, H, PAD_T, PAD_B)).toBeCloseTo(yAtScale(0, 100, H, PAD_T, PAD_B));
  });

  it("clamps values above yMax to the top", () => {
    expect(yAtScale(200, 100, H, PAD_T, PAD_B)).toBeCloseTo(yAtScale(100, 100, H, PAD_T, PAD_B));
  });
});

describe("xAtScale", () => {
  const start = 1_000;
  const span = 1_000;

  it("maps windowStartTs to padL", () => {
    expect(xAtScale(start, start, span, PAD_L, PAD_R, W)).toBeCloseTo(PAD_L);
  });

  it("maps windowStartTs + span to W - padR", () => {
    expect(xAtScale(start + span, start, span, PAD_L, PAD_R, W)).toBeCloseTo(W - PAD_R);
  });

  it("maps the midpoint to the horizontal center", () => {
    const x = xAtScale(start + span / 2, start, span, PAD_L, PAD_R, W);
    const center = PAD_L + (W - PAD_L - PAD_R) / 2;
    expect(x).toBeCloseTo(center);
  });

  it("safety-clamps extreme values to within a sane SVG range", () => {
    const far = xAtScale(start - 100_000, start, span, PAD_L, PAD_R, W);
    const close = xAtScale(start, start, span, PAD_L, PAD_R, W);
    // The extremely early timestamp should produce a value far left but not past the safety clamp.
    expect(far).toBeLessThan(close);
  });
});

describe("buildSeriesSegments", () => {
  const pt = (y: number, present = true): SeriesPoint => ({ y, present });

  it("returns empty for no points", () => {
    expect(buildSeriesSegments([])).toEqual([]);
  });

  it("returns empty for a single point (no segments possible)", () => {
    expect(buildSeriesSegments([pt(5)])).toEqual([]);
  });

  it("returns one solid segment for two adjacent present points", () => {
    const segs = buildSeriesSegments([pt(5), pt(10)]);
    expect(segs).toHaveLength(1);
    expect(segs[0].muted).toBe(false);
    expect(segs[0].opacity).toBeCloseTo(0.88);
    expect(segs[0].i1).toBe(0);
    expect(segs[0].i2).toBe(1);
  });

  it("marks a muted segment when the gap is >1 (skipped tournament)", () => {
    // null in the middle means a skipped tournament
    const segs = buildSeriesSegments([pt(5), null, pt(10)]);
    expect(segs).toHaveLength(1);
    expect(segs[0].muted).toBe(true);
    expect(segs[0].opacity).toBeCloseTo(0.55);
    expect(segs[0].i1).toBe(0);
    expect(segs[0].i2).toBe(2);
  });

  it("marks a muted segment when the destination point was not present", () => {
    const segs = buildSeriesSegments([pt(5), pt(10, false)]);
    expect(segs).toHaveLength(1);
    expect(segs[0].muted).toBe(true);
  });

  it("marks a muted segment when the source point was not present", () => {
    const segs = buildSeriesSegments([pt(5, false), pt(10)]);
    expect(segs).toHaveLength(1);
    expect(segs[0].muted).toBe(true);
  });

  it("builds multiple segments correctly", () => {
    const segs = buildSeriesSegments([pt(1), pt(2), null, pt(4)]);
    expect(segs).toHaveLength(2);
    expect(segs[0].muted).toBe(false); // adjacent present
    expect(segs[1].muted).toBe(true); // gap
  });
});

describe("computeLaneOffsets", () => {
  const pt = (y: number): SeriesPoint => ({ y, present: true });
  const identity = (v: number) => v;

  it("returns an empty map when no series are given", () => {
    expect(computeLaneOffsets(3, [], identity).size).toBe(0);
  });

  it("returns an empty map when only one series is given", () => {
    const s = [{ id: 1, points: [pt(10), pt(20)] }];
    expect(computeLaneOffsets(2, s, identity).size).toBe(0);
  });

  it("returns an empty map when series have sufficiently different y values", () => {
    // Threshold is 2.25 SVG px — y values 100 apart should never overlap.
    const s = [
      { id: 1, points: [pt(10)] },
      { id: 2, points: [pt(200)] },
    ];
    expect(computeLaneOffsets(1, s, identity).size).toBe(0);
  });

  it("assigns symmetric lane offsets when two series share the same y", () => {
    const s = [
      { id: 1, points: [pt(100)] },
      { id: 2, points: [pt(100)] },
    ];
    const offsets = computeLaneOffsets(1, s, identity);
    expect(offsets.has(0)).toBe(true);
    const m = offsets.get(0)!;
    const off1 = m.get(1)!;
    const off2 = m.get(2)!;
    // Offsets must be equal in magnitude, opposite in sign.
    expect(off1 + off2).toBeCloseTo(0);
    expect(Math.abs(off1)).toBeGreaterThan(0);
  });
});
