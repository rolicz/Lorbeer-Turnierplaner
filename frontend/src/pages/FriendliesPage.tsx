import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import FriendlyMatchCard from "./tools/FriendlyMatchCard";
import FriendlyMatchesListCard from "./tools/FriendlyMatchesListCard";
import SectionSeparator from "../ui/primitives/SectionSeparator";
import { usePageSubNav, type SubNavItem } from "../ui/layout/SubNavContext";
import { useSectionSubnav } from "../ui/layout/useSectionSubnav";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";

export default function FriendliesPage() {
  const defaultScrollDoneRef = useRef(false);
  const pageEntered = useRouteEntryLoading();
  const [createReady, setCreateReady] = useState(false);
  const [listReady, setListReady] = useState(false);
  const initialReady = createReady && listReady;

  const pageSections = useMemo(
    () => [
      { key: "create-new", id: "section-friendlies-create" },
      { key: "all-friendlies", id: "section-friendlies-all" },
    ],
    []
  );

  const { activeKey: activeSubKey, blinkKey: subnavBlinkKey, jumpToSection } = useSectionSubnav({
    sections: pageSections,
    enabled: pageEntered,
    initialKey: "all-friendlies",
  });

  useLayoutEffect(() => {
    if (defaultScrollDoneRef.current) return;
    if (!pageEntered || !initialReady) return;
    defaultScrollDoneRef.current = true;
    jumpToSection("all-friendlies", "section-friendlies-all", {
      blink: false,
      lockMs: 600,
      retries: 20,
      behavior: "auto",
    });
  }, [initialReady, jumpToSection, pageEntered]);

  const handleCreateReady = useCallback(() => setCreateReady(true), []);
  const handleListReady = useCallback(() => setListReady(true), []);

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
          }),
      },
    ],
    [activeSubKey, subnavBlinkKey, jumpToSection]
  );

  usePageSubNav(subNavItems);

  if (!pageEntered) {
    return (
      <div className="page">
        <PageLoadingScreen sectionCount={3} />
      </div>
    );
  }

  return (
    <div className="page">
      <SectionSeparator id="section-friendlies-create" title="Create New" className="mt-0 border-t-0 pt-0">
        <FriendlyMatchCard embedded onInitialReady={handleCreateReady} />
      </SectionSeparator>
      <SectionSeparator id="section-friendlies-all" title="All Friendlies" className="min-h-[100svh]">
        <FriendlyMatchesListCard embedded onInitialReady={handleListReady} />
      </SectionSeparator>
    </div>
  );
}
