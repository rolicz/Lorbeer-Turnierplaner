import "@testing-library/jest-dom";

/**
 * jsdom ships no `window.matchMedia`, and the app calls it from code that every browser
 * has it in: `push/push.ts::isStandaloneDisplayMode` ("is this the installed PWA") and the
 * theme manager. Before Q-E only the pages mounted it; now the shell does, because the
 * notification bell asks whether this device is blocked from push, so a bare `render` of a
 * shell component would throw on a gap in the *environment* rather than a fault in the code.
 *
 * The stub answers "no" to every query and registers no listener — which is what a test
 * that is not about media queries wants. A test that *is* about one overrides it itself.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
