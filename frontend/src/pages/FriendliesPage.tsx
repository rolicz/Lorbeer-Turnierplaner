import { useCallback, useEffect, useMemo, useRef } from "react";
import FriendlyMatchCard from "./tools/FriendlyMatchCard";
import FriendlyMatchesListCard from "./tools/FriendlyMatchesListCard";
import SectionSeparator from "../ui/primitives/SectionSeparator";
import { usePageSubNav, type SubNavItem } from "../ui/layout/SubNavContext";
import { useSectionSubnav } from "../ui/layout/useSectionSubnav";

export default function FriendliesPage() {
  const defaultScrollDoneRef = useRef(false);

  const pageSections = useMemo(
    () => [
      { key: "create-new", id: "section-friendlies-create" },
      { key: "all-friendlies", id: "section-friendlies-all" },
    ],
    []
  );

  const { activeKey: activeSubKey, blinkKey: subnavBlinkKey, jumpToSection } = useSectionSubnav({
    sections: pageSections,
    enabled: true,
  });

  const computeAllFriendliesOffset = useCallback((): number => {
    const allEl = document.getElementById("section-friendlies-all");
    const createEl = document.getElementById("section-friendlies-create");
    const headerEl = document.getElementById("app-top-nav");
    if (!allEl || !createEl || !headerEl) return 0;

    const headerHeight = Math.ceil(headerEl.getBoundingClientRect().height);
    const allTop = window.scrollY + allEl.getBoundingClientRect().top;
    const createBottom = window.scrollY + createEl.getBoundingClientRect().bottom;

    const baseTarget = Math.max(0, allTop - headerHeight);
    const minTargetToHideCreate = Math.max(0, createBottom - headerHeight + 1);
    const target = Math.max(baseTarget, minTargetToHideCreate);
    return baseTarget - target;
  }, []);

  useEffect(() => {
    if (defaultScrollDoneRef.current) return;
    defaultScrollDoneRef.current = true;
    window.setTimeout(() => {
      jumpToSection("all-friendlies", "section-friendlies-all", {
        blink: false,
        lockMs: 600,
        retries: 20,
        offsetPx: computeAllFriendliesOffset(),
      });
    }, 0);
  }, [computeAllFriendliesOffset, jumpToSection]);

  const subNavItems = useMemo<SubNavItem[]>(
    () => [
      {
        key: "create-new",
        label: "Create New",
        icon: "fa-plus",
        active: activeSubKey === "create-new",
        className: subnavBlinkKey === "create-new" ? "subnav-click-blink" : "",
        onClick: () =>
          jumpToSection("create-new", "section-friendlies-create", {
            blink: true,
            lockMs: 700,
            retries: 20,
          }),
      },
      {
        key: "all-friendlies",
        label: "All Friendlies",
        icon: "fa-list",
        active: activeSubKey === "all-friendlies",
        className: subnavBlinkKey === "all-friendlies" ? "subnav-click-blink" : "",
        onClick: () =>
          jumpToSection("all-friendlies", "section-friendlies-all", {
            blink: true,
            lockMs: 700,
            retries: 20,
            offsetPx: computeAllFriendliesOffset(),
          }),
      },
    ],
    [activeSubKey, subnavBlinkKey, jumpToSection, computeAllFriendliesOffset]
  );

  usePageSubNav(subNavItems);

  return (
    <div className="page">
      <SectionSeparator id="section-friendlies-create" title="Create New" className="mt-0 border-t-0 pt-0">
        <FriendlyMatchCard embedded />
      </SectionSeparator>
      <SectionSeparator id="section-friendlies-all" title="All Friendlies" className="min-h-[100svh]">
        <FriendlyMatchesListCard embedded />
      </SectionSeparator>
    </div>
  );
}
