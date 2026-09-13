/**
 * Cups on the dashboard: one compact block per cup — who holds it and the reign
 * timeline — sitting between the live tournament and Trends.
 *
 * It is a preview, not a second Cups page: the holder line and the timeline are
 * the shared pieces (`pages/stats/cupParts.tsx`), and every door on the block
 * opens the full Cups sub-view in Stats, where the records, the reign list and
 * the per-player totals live.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import { currentEraMode, getCup, listCupDefs, orderCups, type CupDef } from "../../api/cup.api";
import { qk } from "../../api/queryKeys";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { buildReigns } from "../stats/cupReigns";
import { CupHolder, CupReignTimeline, ReignChip } from "../stats/cupParts";
import { cupSectionHref } from "../stats/statsNav";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { Pill } from "../../ui/primitives/Pill";

export default function CupsPreviewCard() {
  const defsQ = useQuery({ queryKey: qk.cupDefs(), queryFn: listCupDefs });
  const cups = useMemo(() => orderCups(defsQ.data?.cups), [defsQ.data]);

  if (defsQ.isLoading && !defsQ.data) return <InlineLoading label="Loading cups…" className="py-2" />;

  return (
    <>
      <ErrorToastOnError error={defsQ.error} title="Cups loading failed" />
      {/* Two cups share a row on desktop (DESIGN.md §6 category blocks); on a phone
          they stack, each one a flat section like Trends and Standings. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {cups.map((c) => (
          <CupPreview key={c.key} cup={c} />
        ))}
      </div>
    </>
  );
}

function CupPreview({ cup }: { cup: CupDef }) {
  const q = useQuery({ queryKey: qk.cup(cup.key), queryFn: () => getCup(cup.key) });
  const color = rgbFromCssVar(cupColorVarForKey(cup.key));
  const reigns = useMemo(() => buildReigns(q.data), [q.data]);

  // Both doors open the full Cups sub-view *at this cup* (`?cup=<key>`).
  const href = cupSectionHref(cup.key);
  const current = reigns.find((r) => r.current) ?? null;
  const eraMode = currentEraMode(cup.eras);
  // `tournaments_participated` counts the winning tournament itself, so a fresh
  // win is 1 → zero defenses.
  const defended = Math.max(0, (current?.tournaments ?? 0) - 1);

  return (
    <section data-cup={cup.key}>
      <ErrorToastOnError error={q.error} title="Cup loading failed" />

      {/* The header is the first door to the full cup page; the era pill says
          which tournaments currently count, as on the Cups page itself. */}
      <div className="section-head">
        <Link
          to={href}
          title={`Open ${cup.name} in Stats — reigns, records and per-player totals`}
          className="section-label inline-flex min-w-0 items-center gap-2 no-underline transition hover:text-text-normal"
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 0 3px ${color}22` }}
            aria-hidden="true"
          />
          <span className="truncate">{cup.name}</span>
          <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
        </Link>
        {eraMode !== "any" ? (
          <Pill className="order-1 shrink-0" title={`Currently counts ${eraMode} tournaments only`}>
            {eraMode}
          </Pill>
        ) : null}
      </div>

      {q.isLoading && !q.data ? (
        <InlineLoading label="Loading…" className="py-2" />
      ) : (
        /* The whole block is the second door: a stretched link behind it, the
           holder's identity above it as its own link (never a nested <a>). */
        <div className="row-tap relative -mx-2 px-2 py-2">
          <Link
            to={href}
            aria-label={`${cup.name} — open reigns and records in Stats`}
            className="focus-ring absolute inset-0 z-0 rounded-xl"
          />
          <div className="pointer-events-none relative z-10 space-y-3">
            <CupHolder
              owner={q.data?.owner ?? null}
              color={color}
              since={q.data?.streak?.since?.date}
              defended={defended}
              avatarSizeClass="h-10 w-10"
              trailing={current ? <ReignChip tournaments={current.tournaments} current /> : null}
            />
            {reigns.length ? (
              <CupReignTimeline reigns={reigns} />
            ) : (
              <p className="text-sm text-text-muted">No title changes yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
