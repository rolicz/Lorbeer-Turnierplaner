/**
 * The one place the browser asks for a size (W2).
 *
 * The server pre-computes a fixed ladder of widths and serves the one that is asked for
 * (`services/media_derivatives.py`, W1); this module is the browser's half of that
 * bargain — which rungs exist, how many device pixels a CSS box needs, and how to read an
 * avatar's px out of the Tailwind class it is already given. Nothing else in the app
 * decides a width, and a width is only ever attached by `mediaUrl`.
 *
 * Everything here is an optimisation, so every unknown answers "ask for the original":
 * a box we cannot measure, a picture wider than the ladder and a `sizeClass` spelled in a
 * shape we do not recognise all produce no `?w=` at all. A future call site can therefore
 * be slow; it can never be broken.
 *
 * Pure: no React, no network, no query keys.
 */
import type { operations } from "./generated/schema";

/**
 * The widths the server can serve (W1). Taken from the **generated** schema rather than
 * retyped: the backend's `Literal` is published as an OpenAPI enum, so a rung added or
 * removed on the server is a type error here on the next `make gen-types`.
 */
export type MediaWidth = NonNullable<
  NonNullable<operations["get_player_avatar_players__player_id__avatar_get"]["parameters"]["query"]>["w"]
>;

export const MEDIA_WIDTHS = [64, 128, 256, 384, 768, 1152, 1536] as const satisfies readonly MediaWidth[];

/**
 * No device this app runs on draws past 3×, and a 4× request would double the bytes for
 * nothing. jsdom reports 1, which is what makes the tests deterministic.
 */
export const MAX_DPR = 3;

export function devicePixelRatioCapped(): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.min(dpr, MAX_DPR);
}

/**
 * The smallest rung that covers a box of `cssPx`, or **undefined** when none does —
 * which means "ask for the original", the honest answer for a picture bigger than the
 * ladder and for a size we could not work out.
 */
export function mediaWidthFor(cssPx: number): MediaWidth | undefined {
  if (!Number.isFinite(cssPx) || cssPx <= 0) return undefined;
  const need = Math.ceil(cssPx * devicePixelRatioCapped());
  return MEDIA_WIDTHS.find((w) => w >= need);
}

/**
 * The px behind `h-20 w-20` — Tailwind's scale, 4px a step. All `AvatarCircle` /
 * `AvatarButton` call sites spell exactly that shape; anything else (`h-full`,
 * `h-[3.25rem]`) returns null, and the original is served.
 */
export function avatarPxFromSizeClass(sizeClass: string): number | null {
  const m = /(?:^|\s)h-(\d+)(?:\s|$)/.exec(sizeClass);
  return m ? Number(m[1]) * 4 : null;
}
