import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

import PageLayout from "../ui/layout/PageLayout";
import { usePageTitle } from "../ui/layout/PageTitleContext";

/** Catch-all route: an unknown URL should explain itself instead of rendering nothing. */
export default function NotFoundPage() {
  usePageTitle("Not found");
  return (
    <PageLayout title="Not found">
      <section className="card-outer flex flex-col items-center gap-3 py-10 text-center">
        <Compass className="h-8 w-8 text-text-muted opacity-60" aria-hidden="true" />
        <p className="text-sm text-text-muted">
          This page does not exist — the link may be outdated or mistyped.
        </p>
        <Link to="/dashboard" className="btn-base btn-solid inline-flex h-9 items-center px-3">
          Back to dashboard
        </Link>
      </section>
    </PageLayout>
  );
}
