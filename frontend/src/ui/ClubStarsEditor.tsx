import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Club } from "../api/types";
import { patchClub } from "../api/clubs.api";
import { useAuth } from "../auth/AuthContext";
import { cn } from "./cn";
import { STAR_OPTIONS, starsLabel, toHalfStep } from "./clubControls";

export default function ClubStarsEditor({
  clubId,
  clubs,
  disabled = false,
  label = "Stars",
  className,
}: {
  clubId: number | null;
  clubs: Club[];
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const { role, token } = useAuth();
  const qc = useQueryClient();

  const canEdit = (role === "editor" || role === "admin") && !!token;
  const club = useMemo(() => (clubId ? clubs.find((c) => c.id === clubId) ?? null : null), [clubs, clubId]);
  const serverValue = club ? toHalfStep(club.star_rating) : null;

  const [localValue, setLocalValue] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Avoid showing the previous club's stars when switching clubs.
    setLocalValue(null);
    setErr(null);
  }, [clubId]);

  const effectiveValue = localValue ?? serverValue;

  const patchMut = useMutation({
    mutationFn: async (v: number) => {
      if (!token) throw new Error("No token");
      if (!clubId) throw new Error("No club selected");
      return patchClub(token, clubId, { star_rating: v });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["clubs"] });
    },
    onError: (e: any) => {
      setLocalValue(null);
      setErr(String(e?.message ?? e));
    },
  });

  if (!canEdit) return null;

  const uiDisabled = disabled || !clubId || patchMut.isPending;

  return (
    <label className={cn("block", className)}>
      <div className="input-label">{label}</div>
      <select
        className="select-field"
        value={effectiveValue == null ? "" : String(effectiveValue)}
        onChange={(e) => {
          const next = e.target.value ? Number(e.target.value) : null;
          if (next == null || !Number.isFinite(next)) return;
          if (!clubId) return;
          if (serverValue != null && next === serverValue) return;
          setErr(null);
          setLocalValue(next);
          patchMut.mutate(next);
        }}
        disabled={uiDisabled}
        title={clubId ? `Set stars for ${club?.name ?? `#${clubId}`}` : "Select a club first"}
      >
        <option value="">{clubId ? "—" : "Select club first"}</option>
        {STAR_OPTIONS.map((v) => (
          <option key={v} value={String(v)}>
            {starsLabel(v)}★
          </option>
        ))}
      </select>
      {err && <div className="mt-1 text-[11px] text-red-400">{err}</div>}
    </label>
  );
}

