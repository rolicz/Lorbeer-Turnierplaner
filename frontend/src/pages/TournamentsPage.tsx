import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "../ui/primitives/Card";
import Button from "../ui/primitives/Button";
import Input from "../ui/primitives/Input";
import SectionHeader from "../ui/primitives/SectionHeader";
import { Meta } from "../ui/primitives/Meta";
import { Pill, statusPill, pillDate } from "../ui/primitives/Pill";
import { tournamentPalette, tournamentStatusUI } from "../ui/theme";
import { cn } from "../ui/cn";
import { listTournaments, createTournament, generateSchedule } from "../api/tournaments.api";
import { listPlayers } from "../api/players.api";
import { useAuth } from "../auth/AuthContext";
import { fmtDate } from "../utils/format";


import { useAnyTournamentWS } from "../hooks/useTournamentWS";

type Status = "draft" | "live" | "done";


// Best-effort winner label (depends on what your /tournaments list returns)
function winnerLabel(t: any): string | null {
  if(t.winner_string) {
    return t.winner_string;
  } 
  else if(t.winner_decider_string) {
    return t.winner_decider_string + " (decider)";
  }
  return null;
}

export default function TournamentsPage() {
  const qc = useQueryClient();
  const { role, token } = useAuth();
  const canWrite = role === "editor" || role === "admin";

  const tournamentsQ = useQuery({ queryKey: ["tournaments"], queryFn: listTournaments });
  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers, enabled: canWrite });

  useAnyTournamentWS();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"1v1" | "2v2">("1v1");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)),
    [selected]
  );

  // Sort tournaments by date (newest first), fallback to created_at
  const tournamentsSorted = useMemo(() => {
    const ts = tournamentsQ.data ?? [];
    const key = (t: any) => {
      const d = t.date ? `${t.date}T00:00:00` : t.created_at ?? null;
      const ms = d ? new Date(d).getTime() : 0;
      return Number.isFinite(ms) ? ms : 0;
    };

    return ts.slice().sort((a: any, b: any) => {
      const da = key(a);
      const db = key(b);
      if (db !== da) return db - da;
      const ia = typeof a.id === "number" ? a.id : 0;
      const ib = typeof b.id === "number" ? b.id : 0;
      return ib - ia;
    });
  }, [tournamentsQ.data]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      if (!name.trim()) throw new Error("Name missing");
      if (selectedIds.length < 3) throw new Error("Select at least 3 players");
      const created = await createTournament(token, { name: name.trim(), mode, player_ids: selectedIds });
      await generateSchedule(token, created.id, true);
      return created.id;
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setName("");
      setSelected({});
      await qc.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });

  return (
    <div className="page">
      <Card variant="outer" showHeader={false}>
        <SectionHeader
          left={<Meta size="sm">Active + past tournaments.</Meta>}
          right={
            <>
              <Button
                variant="ghost"
                onClick={() => qc.invalidateQueries({ queryKey: ["tournaments"] })}
                title="Refresh"
              >
                <i className="fa fa-refresh md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Refresh</span>
              </Button>
              {canWrite ? (
                <Button
                  variant={createOpen ? "ghost" : "solid"}
                  onClick={() => setCreateOpen((v) => !v)}
                  title={createOpen ? "Close new tournament" : "New Tournament"}
                >
                  <i className={"fa " + (createOpen ? "fa-chevron-up" : "fa-plus") + " md:hidden"} aria-hidden="true" />
                  <span className="hidden md:inline">{createOpen ? "Close" : "New"}</span>
                </Button>
              ) : null}
            </>
          }
        />

        {canWrite && createOpen ? (
          <div className="mt-3 panel-subtle p-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="42. Lorbeerkranz Turnier"
              />

              <div>
                <div className="input-label">Mode</div>
                <div
                  className="relative inline-flex w-full rounded-2xl p-1"
                  style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
                  role="group"
                  aria-label="Tournament mode"
                >
                  <span
                    className="absolute inset-y-1 left-1 w-1/2 rounded-xl shadow-sm transition-transform duration-200 ease-out"
                    style={{
                      backgroundColor: "rgb(var(--color-bg-card-inner))",
                      transform: `translateX(${mode === "1v1" ? 0 : 100}%)`,
                    }}
                    aria-hidden="true"
                  />
                  {(
                    [
                      { k: "1v1" as const, label: "1v1" },
                      { k: "2v2" as const, label: "2v2" },
                    ] as const
                  ).map((x) => (
                    <button
                      key={x.k}
                      type="button"
                      onClick={() => setMode(x.k)}
                      className={
                        "relative z-10 inline-flex h-10 w-1/2 items-center justify-center rounded-xl text-sm transition-colors " +
                        (mode === x.k ? "text-text-normal" : "text-text-muted hover:text-text-normal")
                      }
                      aria-pressed={mode === x.k}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-text-normal">Players</div>
              {playersQ.isLoading && <div className="text-sm text-text-muted">Loading players…</div>}
              {playersQ.error && <div className="text-sm text-red-400">{String(playersQ.error)}</div>}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {playersQ.data?.map((p) => {
                  const checked = !!selected[p.id];
                  return (
                    <label
                      key={p.id}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-2 py-2 text-sm transition",
                        checked
                          ? "border-accent/50 bg-bg-card-inner"
                          : "border-border-card-chip/70 bg-bg-card-chip/25 hover:bg-bg-card-chip/40"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                      />
                      <span className="truncate">{p.display_name}</span>
                    </label>
                  );
                })}
              </div>
              <div className="text-xs text-text-muted">Selected: {selectedIds.length}</div>
            </div>

            {createMut.error && <div className="text-sm text-red-400">{String(createMut.error)}</div>}

            <div className="flex items-center justify-end gap-2">
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} type="button">
                <i className="fa fa-check md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">{createMut.isPending ? "Creating…" : "Create"}</span>
              </Button>
            </div>
          </div>
        ) : null}

        <div className={cn(canWrite && createOpen ? "mt-3 space-y-2" : "mt-3 space-y-2")}>
          {tournamentsQ.isLoading && <div className="text-text-muted">Loading…</div>}
          {tournamentsQ.error && <div className="text-red-400 text-sm">{String(tournamentsQ.error)}</div>}

          {tournamentsSorted.map((t: any) => {
            const st: Status = (t.status as Status) ?? "draft";
            const ui = tournamentStatusUI(st);
            const pal = tournamentPalette(st);
            const winner = winnerLabel(t);

            return (
              <Link
                key={t.id}
                to={`/live/${t.id}`}
                className={cn(
                  "relative block overflow-hidden rounded-xl border px-4 py-3 transition",
                  pal.wrap
                )}
              >
                {/* left accent bar */}
                <div className={`absolute left-0 top-0 h-full w-1 ${pal.bar}`} />

                <div className="pl-1">
                  {/* Row 1: name + small mode pill */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-text-normal sm:text-base">
                        {t.name}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Pill title="Mode">
                        {t.mode === "2v2" ? "2v2" : "1v1"}
                      </Pill>
                    </div>
                  </div>

                  {/* Row 2: pills (responsive) */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Pill className={statusPill(st)} title={ui.label}>
                      <span>{ui.label}</span>
                    </Pill>

                    <Pill className={pillDate()} title="Date" >
                      <span>{fmtDate(t.date)}</span>
                    </Pill>

                    {winner && (
                      <Pill title="Winner">
                        <span>
                          <i className="fa fa-trophy text-yellow-400 mr-1" aria-hidden="true" />
                        </span>
                        <span className="max-w-[160px] truncate sm:max-w-[260px]">{winner}</span>
                      </Pill>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
