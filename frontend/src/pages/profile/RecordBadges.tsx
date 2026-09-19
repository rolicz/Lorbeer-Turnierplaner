import { useState } from "react";

import Modal from "../../ui/primitives/Modal";
import { List, ListRow } from "../../ui/primitives/List";
import { cn } from "../../ui/cn";
import { recordIcon, recordModeLabel } from "../stats/recordIcons";
import type { StatsRecord } from "../../api/types";

/**
 * The records this player holds today, as one wrapping band of icon chips (M5, Rumpi's idea).
 * Grey `.chip`s with a lucide glyph — never a cup token, never a Crown: the avatar ring a few
 * pixels away means "holds a cup today" (T15/C12) and this must read as a different kind of mark.
 * An ongoing streak record wears `border-accent`, the signal `PlayerStreakChips` already paints on
 * this profile for "the record is being set right now". No count: ties are visible in Stats.
 *
 * A glyph on its own cannot say what it stands for, so the band is a **legend, not a link** (M8):
 * every chip is a `button` that opens the app's one overlay (`Modal`) listing exactly the records
 * this player holds — the glyph, the record's label, its explainer — and the *row* is what
 * navigates, to the `path` the backend emits. A badge that went straight to Stats asked the reader
 * to already know what it meant. Buttons also end the nested-anchor hazard the band had to guard
 * against: there is no `<a>` in the band at all.
 */

/** The band's chip: the glyph, plus the mode spelled beside it where the band has no room for words. */
const BAND_CHIP = "chip inline-flex h-7 items-center gap-1 px-2";

/**
 * The sheet's leading mark: the same grey chip, but a **fixed 28px square** holding the glyph
 * alone. The band's three Elo chips are 51px against 32px for the rest (the `1v1`/`2v2`
 * micro-label), and a variable leading slot would push those rows' label and explainer right —
 * nothing in the column would line up (Roli, M8). Nothing is lost: `RECORD_DEFS` already spells
 * the mode into the name ("Highest Elo (1v1)"), which is the whole line the row prints.
 */
const SHEET_MARK = "chip inline-flex h-7 w-7 shrink-0 items-center justify-center p-0";

type Held = { r: StatsRecord; ongoing: boolean };

/** The legend the band opens: only what this player holds, one row each, the row navigates. */
function RecordsHeldSheet({ open, held, onClose }: { open: boolean; held: Held[]; onClose: () => void }) {
  return (
    <Modal
      open={open}
      title="Records held"
      subtitle="What each badge means — tap one to open it in Stats."
      onClose={onClose}
      maxWidth="max-w-md"
      scrollBody
      className="max-h-sheet sm:max-h-sheet-sm overflow-hidden"
    >
      <div className="flex-1 min-h-0 overflow-y-auto" data-records-held>
        <List>
          {held.map(({ r, ongoing }) => {
            const Icon = recordIcon(r.key);
            return (
              <ListRow
                key={r.key}
                to={r.path}
                ariaLabel={`${r.label}: record holder${ongoing ? ", current run" : ""}. Open in Stats`}
                leading={
                  <span className={cn(SHEET_MARK, ongoing && "border-accent")} data-record={r.key} aria-hidden="true">
                    <Icon size={14} strokeWidth={2.25} />
                  </span>
                }
              >
                <span className="block font-medium text-text-normal">
                  {r.label}
                  {ongoing ? <span className="ml-1.5 align-middle chip">current</span> : null}
                </span>
                {r.explainer ? <span className="mt-0.5 block text-xs text-text-muted">{r.explainer}</span> : null}
              </ListRow>
            );
          })}
        </List>
      </div>
    </Modal>
  );
}

export default function RecordBadges({ playerId, records }: { playerId: number; records: StatsRecord[] }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const held: Held[] = records.flatMap((r) => {
    const h = r.holders.find((x) => x.player.id === playerId);
    return h ? [{ r, ongoing: h.ongoing }] : [];
  });

  if (held.length === 0) return null;

  return (
    <>
      <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Records held" data-record-badges>
        {held.map(({ r, ongoing }) => {
          const Icon = recordIcon(r.key);
          const modeLabel = recordModeLabel(r.key);
          return (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                data-record={r.key}
                data-ongoing={ongoing || undefined}
                className={cn(BAND_CHIP, "focus-ring", ongoing && "border-accent")}
                title={ongoing ? `${r.label} — record holder, current run` : `${r.label} — record holder`}
                aria-label={`${r.label}: record holder${ongoing ? ", current run" : ""}. Show what the badges mean`}
              >
                <Icon size={14} strokeWidth={2.25} aria-hidden="true" />
                {modeLabel ? <span className="text-micro leading-none">{modeLabel}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <RecordsHeldSheet open={sheetOpen} held={held} onClose={() => setSheetOpen(false)} />
    </>
  );
}
