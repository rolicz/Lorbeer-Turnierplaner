import type { ReactNode } from "react";
import type { Club, Match, StatsPlayerMatchesTournament } from "../../api/types";
import { sideBy } from "../../helpers";
import { clubLabelPartsById } from "../../ui/clubControls";
import { Pill, pillDate } from "../../ui/primitives/Pill";
import { StarsFA } from "../../ui/primitives/StarsFA";

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function winnerSide(m: Match): "A" | "B" | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const ag = a?.goals ?? 0;
  const bg = b?.goals ?? 0;
  if (ag === bg) return null;
  return ag > bg ? "A" : "B";
}

export function MatchRowWithClubs({
  m,
  focusId,
  clubs,
  showMeta,
  action,
}: {
  m: Match;
  focusId?: number | null;
  clubs: Club[];
  showMeta: boolean;
  action?: ReactNode;
}) {
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const aClub = clubLabelPartsById(clubs, a?.club_id);
  const bClub = clubLabelPartsById(clubs, b?.club_id);

  const ag = a?.goals ?? 0;
  const bg = b?.goals ?? 0;
  const showScore = m.state !== "scheduled";

  type NameLine = { id: number; display_name: string };
  const aPlayers: NameLine[] = (a?.players ?? [])
    .filter((p) => Boolean(p.display_name))
    .map((p) => ({ id: p.id, display_name: p.display_name }));
  const bPlayers: NameLine[] = (b?.players ?? [])
    .filter((p) => Boolean(p.display_name))
    .map((p) => ({ id: p.id, display_name: p.display_name }));
  const aDisplay: NameLine[] = aPlayers.length ? aPlayers : [{ id: -1, display_name: "—" }];
  const bDisplay: NameLine[] = bPlayers.length ? bPlayers : [{ id: -2, display_name: "—" }];

  const focusSide: "A" | "B" | null = (() => {
    if (!focusId) return null;
    const aHas = (a?.players ?? []).some((p) => p.id === focusId);
    const bHas = (b?.players ?? []).some((p) => p.id === focusId);
    if (aHas && !bHas) return "A";
    if (bHas && !aHas) return "B";
    return null;
  })();

  const w = winnerSide(m);

  const res = (() => {
    if (m.state !== "finished" || !focusSide) return null;
    if (!w) return "D";
    return w === focusSide ? "W" : "L";
  })();

  const scoreCls =
    res === "W"
      ? "bg-status-bg-green/35 border-status-border-green/40 text-status-text-green"
      : res === "L"
        ? "bg-red-500/15 border-red-500/30 text-text-normal"
        : res === "D"
          ? "bg-amber-500/15 border-amber-500/30 text-text-normal"
          : "bg-bg-card-chip/30 border-border-card-inner/45 text-text-normal";

  const outerPad = showMeta ? "p-3" : "p-2";
  const nameText = showMeta ? "text-[15px] md:text-lg" : "text-[13px] md:text-base";
  const rowPad = showMeta ? "py-2" : "py-1";
  const scorePad = showMeta ? "px-4 py-2" : "px-3 py-1.5";
  const scoreText = showMeta ? "text-xl md:text-2xl" : "text-lg md:text-xl";

  return (
    <div className="flex items-stretch gap-2">
      <div className={`panel-subtle min-w-0 flex-1 rounded-xl ${outerPad}`}>
        <div className={rowPad}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4">
            <div className="min-w-0">
              {aDisplay.map((p, i) => (
                <div
                  key={`${p.display_name}-${i}`}
                  className={
                    nameText + " whitespace-normal md:truncate break-words leading-tight font-medium text-text-normal"
                  }
                >
                  {p.display_name}
                </div>
              ))}
            </div>

            <div
              className={`card-chip justify-self-center flex items-center justify-center gap-2 border shadow-sm ${scorePad} ${scoreCls}`}
            >
              <span className={scoreText + " font-semibold tabular-nums"}>{showScore ? String(ag) : "-"}</span>
              <span className="opacity-80">:</span>
              <span className={scoreText + " font-semibold tabular-nums"}>{showScore ? String(bg) : "-"}</span>
            </div>

            <div className="min-w-0 text-right">
              {bDisplay.map((p, i) => (
                <div
                  key={`${p.display_name}-${i}`}
                  className={
                    nameText + " whitespace-normal md:truncate break-words leading-tight font-medium text-text-normal"
                  }
                >
                  {p.display_name}
                </div>
              ))}
            </div>
          </div>
        </div>

        {showMeta ? (
          <>
            <div className="mt-2 md:mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
              <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClub.name}</div>
              <div />
              <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight text-right">{bClub.name}</div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
              <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClub.league_name}</div>
              <div />
              <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight text-right">{bClub.league_name}</div>
            </div>

            <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4 text-[11px] md:text-sm text-text-muted">
              <div className="min-w-0">
                <StarsFA rating={aClub.rating ?? 0} textClassName="text-text-muted" />
              </div>
              <div />
              <div className="min-w-0 flex justify-end">
                <StarsFA rating={bClub.rating ?? 0} textClassName="text-text-muted" />
              </div>
            </div>
          </>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

export function MatchHistoryTournamentBlock({
  t,
  focusId,
  clubs,
  showMeta,
  actions,
  hideModePill = false,
  renderMatchAction,
}: {
  t: StatsPlayerMatchesTournament;
  focusId?: number | null;
  clubs: Club[];
  showMeta: boolean;
  actions?: ReactNode;
  hideModePill?: boolean;
  renderMatchAction?: (t: StatsPlayerMatchesTournament, m: Match) => ReactNode;
}) {
  return (
    <div className="card-inner-flat rounded-2xl space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-normal">{t.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Pill className={pillDate()}>{fmtDate(t.date)}</Pill>
            {!hideModePill ? <Pill className="pill-default">{t.mode}</Pill> : null}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <div className="text-[11px] text-text-muted">{t.matches.length} matches</div>
          {actions ?? null}
        </div>
      </div>

      <div className="space-y-2">
        {t.matches.map((m) => (
          <MatchRowWithClubs
            key={m.id}
            m={m}
            focusId={focusId}
            clubs={clubs}
            showMeta={showMeta}
            action={renderMatchAction ? renderMatchAction(t, m) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function MatchHistoryList({
  tournaments,
  focusId,
  clubs,
  showMeta,
  renderTournamentActions,
  renderMatchActions,
  hideModePill = false,
}: {
  tournaments: StatsPlayerMatchesTournament[];
  focusId?: number | null;
  clubs: Club[];
  showMeta: boolean;
  renderTournamentActions?: (t: StatsPlayerMatchesTournament) => ReactNode;
  renderMatchActions?: (t: StatsPlayerMatchesTournament, m: Match) => ReactNode;
  hideModePill?: boolean;
}) {
  return (
    <div className="space-y-3">
      {tournaments.map((t) => (
        <MatchHistoryTournamentBlock
          key={t.id}
          t={t}
          focusId={focusId}
          clubs={clubs}
          showMeta={showMeta}
          actions={renderTournamentActions ? renderTournamentActions(t) : undefined}
          hideModePill={hideModePill}
          renderMatchAction={renderMatchActions}
        />
      ))}
    </div>
  );
}
