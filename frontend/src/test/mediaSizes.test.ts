/**
 * W2 — the one place the browser asks for a size.
 *
 * The ladder is the server's (`services/media_derivatives.py::MEDIA_WIDTHS`), and the two
 * sides are kept in step by types rather than by memory: `as const satisfies` catches a
 * rung the browser has and the server does not, and the assignment at the bottom of the
 * first test catches the other direction. What is asserted here is the arithmetic on top
 * of it — the rungs §3 of the plan predicts for every box the app actually draws — and the
 * promise this batch rests on: a `mediaUrl` call without a width is byte-identical to the
 * one it made before W2, so nothing already in a browser's cache is invalidated.
 */
import { afterEach, describe, expect, it } from "vitest";

import { mediaUrl, API_BASE } from "../api/client";
import { MAX_DPR, MEDIA_WIDTHS, avatarPxFromSizeClass, devicePixelRatioCapped, mediaWidthFor, type MediaWidth } from "../api/mediaSizes";

function setDpr(value: number) {
  Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });
}

afterEach(() => setDpr(1));

describe("the ladder", () => {
  it("is ascending, unique, and the same seven rungs the server serves", () => {
    expect([...MEDIA_WIDTHS]).toEqual([64, 128, 256, 384, 768, 1152, 1536]);
    expect(new Set(MEDIA_WIDTHS).size).toBe(MEDIA_WIDTHS.length);
    expect([...MEDIA_WIDTHS].sort((a, b) => a - b)).toEqual([...MEDIA_WIDTHS]);

    // `as const satisfies readonly MediaWidth[]` already rejects a rung the server does not
    // have; this catches one the server has and the browser forgot.
    const everyRungListed: Exclude<MediaWidth, (typeof MEDIA_WIDTHS)[number]> extends never ? true : never = true;
    expect(everyRungListed).toBe(true);
  });
});

describe("mediaWidthFor", () => {
  it("picks the smallest rung that covers the box at dpr 1", () => {
    setDpr(1);
    expect(mediaWidthFor(24)).toBe(64);
    expect(mediaWidthFor(28)).toBe(64);
    expect(mediaWidthFor(32)).toBe(64);
    expect(mediaWidthFor(40)).toBe(64);
    expect(mediaWidthFor(56)).toBe(64);
    expect(mediaWidthFor(71)).toBe(128);
    expect(mediaWidthFor(80)).toBe(128);
    expect(mediaWidthFor(358)).toBe(384);
    expect(mediaWidthFor(1104)).toBe(1152);
  });

  it("multiplies by the device's own pixels — the plan's dpr-3 column", () => {
    setDpr(3);
    expect(mediaWidthFor(24)).toBe(128); // 72
    expect(mediaWidthFor(28)).toBe(128); // 84
    expect(mediaWidthFor(40)).toBe(128); // 120
    expect(mediaWidthFor(56)).toBe(256); // 168
    expect(mediaWidthFor(71)).toBe(256); // 213
    expect(mediaWidthFor(80)).toBe(256); // 240
    expect(mediaWidthFor(358)).toBe(1152); // 1074
  });

  it("asks for the original when nothing on the ladder covers the box", () => {
    setDpr(1);
    expect(mediaWidthFor(4000)).toBeUndefined();
    setDpr(3);
    expect(mediaWidthFor(1104)).toBeUndefined(); // 3312, past the top rung
  });

  it("treats a box it cannot measure as 'serve the original', never as a rung", () => {
    expect(mediaWidthFor(0)).toBeUndefined();
    expect(mediaWidthFor(-10)).toBeUndefined();
    expect(mediaWidthFor(Number.NaN)).toBeUndefined();
    expect(mediaWidthFor(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it("caps the device pixel ratio: a 4x screen is served the 3x picture", () => {
    setDpr(4);
    expect(devicePixelRatioCapped()).toBe(MAX_DPR);
    expect(mediaWidthFor(80)).toBe(256);
    setDpr(2);
    expect(devicePixelRatioCapped()).toBe(2);
  });
});

describe("avatarPxFromSizeClass", () => {
  it("reads Tailwind's four-px step out of the class the call site already passes", () => {
    expect(avatarPxFromSizeClass("h-6 w-6")).toBe(24);
    expect(avatarPxFromSizeClass("h-10 w-10")).toBe(40);
    expect(avatarPxFromSizeClass("h-20 w-20")).toBe(80);
    expect(avatarPxFromSizeClass("shrink-0 h-14 w-14")).toBe(56);
  });

  it("returns null for anything it does not recognise, so the original is served", () => {
    expect(avatarPxFromSizeClass("h-full w-full")).toBeNull();
    expect(avatarPxFromSizeClass("h-[3.25rem] w-[3.25rem]")).toBeNull();
    expect(avatarPxFromSizeClass("")).toBeNull();
    expect(avatarPxFromSizeClass("w-10")).toBeNull();
  });
});

describe("mediaUrl", () => {
  /** `mediaUrl` exactly as it stood at the batch's baseline, before W2 touched it. */
  function legacyMediaUrl(path: string, updatedAt?: string | null): string {
    const base = API_BASE.replace(/\/+$/, "");
    const v = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
    return `${base}${path.startsWith("/") ? "" : "/"}${path}${v}`;
  }

  it("is byte-identical to the pre-W2 builder whenever no width is asked for", () => {
    const cases: [string, (string | null | undefined)?][] = [
      ["/players/1/avatar", "2026-02-07T22:49:55.205956"],
      ["/players/1/header-image", "2026-02-14T21:45:46.578278"],
      ["players/guestbook-subjects/4/image", "2026-09-19T17:50:11.010559"],
      ["/clubs/200/crest", null],
      ["/comments/79/image", undefined],
      ["/players/1/avatar", ""],
    ];
    for (const [path, v] of cases) {
      expect(mediaUrl(path, v)).toBe(legacyMediaUrl(path, v));
      expect(mediaUrl(path, v, undefined)).toBe(legacyMediaUrl(path, v));
      expect(mediaUrl(path, v, null)).toBe(legacyMediaUrl(path, v));
    }
    expect(mediaUrl("/players/1/avatar", "2026-02-07T22:49:55.205956")).toBe(
      `${API_BASE}/players/1/avatar?v=2026-02-07T22%3A49%3A55.205956`,
    );
  });

  it("puts the width behind the version, and asks for one alone when there is no version", () => {
    expect(mediaUrl("/players/1/avatar", "2026-02-07T22:49:55.205956", 128)).toBe(
      `${API_BASE}/players/1/avatar?v=2026-02-07T22%3A49%3A55.205956&w=128`,
    );
    expect(mediaUrl("/players/1/avatar", null, 256)).toBe(`${API_BASE}/players/1/avatar?w=256`);
  });
});
