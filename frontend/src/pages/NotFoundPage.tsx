import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";

import PageLayout from "../ui/layout/PageLayout";
import { usePageTitle } from "../ui/layout/PageTitleContext";
import { forgetLocation } from "../ui/shell/lastLocation";
import { buttonClass } from "../ui/primitives/Button";

/** Catch-all route: an unknown URL should explain itself instead of rendering nothing. */
export default function NotFoundPage() {
  usePageTitle("Not found");
  const { pathname, search } = useLocation();

  // A dead URL must never be the page a nav destination returns to (U6).
  useEffect(() => {
    forgetLocation(pathname + search);
  }, [pathname, search]);

  return (
    <PageLayout title="Not found">
      <section className="card-outer flex flex-col items-center gap-3 py-10 text-center">
        <Compass className="h-8 w-8 text-text-muted opacity-60" aria-hidden="true" />
        <p className="text-sm text-text-muted">
          This page does not exist — the link may be outdated or mistyped.
        </p>
        <Link to="/dashboard" className={buttonClass({ variant: "solid", size: "md" })}>
          Back to dashboard
        </Link>
      </section>
    </PageLayout>
  );
}
