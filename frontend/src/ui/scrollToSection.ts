export function scrollToSectionById(
  id: string,
  retries = 0,
  extraOffsetPx = 0,
  behavior: ScrollBehavior = "smooth"
) {
  let tries = 0;
  const maxTries = Math.max(0, retries);

  const run = () => {
    const el = document.getElementById(id);
    if (!el) {
      if (tries >= maxTries) return;
      tries += 1;
      window.setTimeout(run, 60);
      return;
    }

    // Measure after layout has settled for this frame, then scroll once.
    window.requestAnimationFrame(() => {
      const header = document.getElementById("app-top-nav");
      const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      const targetTop = Math.max(
        0,
        window.scrollY + el.getBoundingClientRect().top - headerHeight - extraOffsetPx
      );
      window.scrollTo({ top: targetTop, behavior });
    });
  };

  run();
}
