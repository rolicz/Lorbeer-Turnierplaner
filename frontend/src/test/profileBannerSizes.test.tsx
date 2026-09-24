/**
 * W3 — the drawn picture and the zoomable picture are two different URLs.
 *
 * The banner is the app's largest picture (2,662,379 bytes on the dev data, measured) and
 * the smallest use of it: 356px on a 390px phone. What is asserted here is the split —
 * the `<img>` offers the four rungs a 16:9 banner can reach and `sizes` says how wide the
 * box is, while the lightbox the banner opens is handed the original with **no `w=` at
 * all**. That last line is the guarantee, not a hope: `ImageLightbox` zooms to 6x, and a
 * resized picture behind a zoom is a worse bug than a slow one.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import ProfileHeader from "../pages/profile/ProfileHeader";
import { API_BASE } from "../api/client";

// jsdom has no ResizeObserver and the lightbox constructs one unguarded (it measures its
// own viewport to clamp the pan). The no-op stub is `imageLightboxFooter.test.tsx`'s, and
// is enough: nothing here asserts on the pan limits, only on the URL it was handed.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const HEADER_UPDATED = "2026-02-14T21:45:46.578278";
const HEADER = `${API_BASE}/players/1/header-image`;
const V = "v=2026-02-14T21%3A45%3A46.578278";

function renderHeader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProfileHeader
        targetPlayerId={1}
        canEdit={false}
        isOwnProfile={false}
        displayName="Roli"
        avatarUpdatedAt={null}
        profileHeaderUpdatedAt={HEADER_UPDATED}
        ownedCups={[]}
        totalGuestbookCount={0}
        unreadGuestbookCount={0}
        unreadGuestbookAuthorsText=""
        unreadGuestbookAuthorCount={0}
        pokes={
          {
            unreadPokeCount: 0,
            unreadPokeAuthorsText: "",
            totalPokeCount: 0,
            canPokeAsActor: false,
            pokeFlashKind: null,
            pokeMut: { isPending: false, mutateAsync: () => Promise.resolve(undefined) },
            markPokesReadAllMut: { isPending: false, mutateAsync: () => Promise.resolve(undefined) },
          } as unknown as React.ComponentProps<typeof ProfileHeader>["pokes"]
        }
        records={[]}
        subjectCounts={{ avatar: 0, header_image: 0, about: 0 }}
        canPostGuestbook={false}
        onCommentOn={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("the profile banner asks for the size it is drawn at (W3)", () => {
  it("offers the four rungs a banner can reach, each with its own descriptor", () => {
    const { container } = renderHeader();
    const img = container.querySelector("img[data-profile-banner]") as HTMLImageElement;
    expect(img).toBeTruthy();

    const candidates = img.getAttribute("srcset")!.split(", ");
    expect(candidates).toEqual([
      `${HEADER}?${V}&w=384 384w`,
      `${HEADER}?${V}&w=768 768w`,
      `${HEADER}?${V}&w=1152 1152w`,
      `${HEADER}?${V}&w=1536 1536w`,
    ]);
    // The descriptor and the rung it points at must be the same number, or the browser
    // picks by a width the file does not have.
    for (const c of candidates) {
      const [url, descriptor] = c.split(" ");
      expect(`${new URL(url, "http://x").searchParams.get("w")}w`).toBe(descriptor);
    }
  });

  it("says how wide the box is, in the three ranges the page column has", () => {
    const { container } = renderHeader();
    const img = container.querySelector("img[data-profile-banner]") as HTMLImageElement;

    expect(img.getAttribute("sizes")).toBe(
      "(min-width: 1024px) 1104px, (min-width: 640px) calc(100vw - 40px), calc(100vw - 32px)",
    );
    // The fallback `src` is the rung a phone at dpr3 and a 1280px desktop both land on,
    // so a browser that ignores `srcset` is still 66x lighter than it was.
    expect(img.getAttribute("src")).toBe(`${HEADER}?${V}&w=1152`);
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
  });

  it("opens the original in the lightbox — no `w=` anywhere in it", () => {
    const { container } = renderHeader();
    fireEvent.click(container.querySelector('button[title="Open header image"]') as Element);

    // The lightbox's own <img> is the only one on screen carrying no width.
    const opened = Array.from(container.querySelectorAll("img")).filter(
      (i) => (i.getAttribute("src") ?? "").includes("/players/1/header-image") && !i.hasAttribute("data-profile-banner"),
    );
    expect(opened.length).toBe(1);
    expect(opened[0].getAttribute("src")).toBe(`${HEADER}?${V}`);
    expect(opened[0].getAttribute("src")).not.toContain("w=");
    expect(opened[0].hasAttribute("srcset")).toBe(false);
  });
});
