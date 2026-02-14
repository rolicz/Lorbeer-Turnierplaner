import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Club } from "../api/types";
import { patchClub } from "../api/clubs.api";
import { useAuth } from "../auth/AuthContext";
import { cn } from "./cn";
import { STAR_OPTIONS, starsLabel, toHalfStep } from "./clubControls";
import { ErrorToastOnError } from "./primitives/ErrorToast";

export default function ClubStarsEditor({
  clubId,
  clubs,
  disabled = false,
  label = "Stars",
  className,
  compact = true,
}: {
  clubId: number | null;
  clubs: Club[];
  disabled?: boolean;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const { role, token } = useAuth();
  const qc = useQueryClient();

  const canEdit = (role === "editor" || role === "admin") && !!token;
  const club = useMemo(() => (clubId ? clubs.find((c) => c.id === clubId) ?? null : null), [clubs, clubId]);
  const serverValue = club ? toHalfStep(club.star_rating) : null;

  const [localByClub, setLocalByClub] = useState<{ clubId: number | null; value: number | null }>({
    clubId: null,
    value: null,
  });
  const [errByClub, setErrByClub] = useState<{ clubId: number | null; message: string | null }>({
    clubId: null,
    message: null,
  });
  const localValue = localByClub.clubId === clubId ? localByClub.value : null;
  const err = errByClub.clubId === clubId ? errByClub.message : null;

  const effectiveValue = localValue ?? serverValue;

  const patchMut = useMutation({
    mutationFn: async (v: number) => {
      if (!token) throw new Error("No token");
      if (!clubId) throw new Error("No club selected");
      return patchClub(token, clubId, { star_rating: v });
    },
    onSuccess: async () => {
      setLocalByClub({ clubId, value: null });
      await qc.invalidateQueries({ queryKey: ["clubs"] });
    },
    onError: (e: unknown) => {
      const message = e instanceof Error && e.message ? e.message : "Could not update stars";
      setLocalByClub({ clubId, value: null });
      setErrByClub({ clubId, message });
    },
  });

  if (!canEdit) return null;

  const uiDisabled = disabled || !clubId || patchMut.isPending;

  if (compact) {
    const txt = effectiveValue == null ? "★" : `${starsLabel(effectiveValue)}★`;
    return (
      <div className={cn("inline-block", className)}>
        <ErrorToastOnError error={err} title="Could not update club stars" />
        <div className="relative inline-flex">
          <div
            className={cn(
              "btn-base btn-ghost inline-flex items-center gap-2 px-3 py-2",
              uiDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
            )}
            aria-hidden="true"
          >
            <span className="tabular-nums">{txt}</span>
            <span className="text-subtle">▾</span>
          </div>

          {/* Native select overlaid for mobile-friendly UX */}
          <select
            className="absolute inset-0 opacity-0"
            value={effectiveValue == null ? "" : String(effectiveValue)}
            onChange={(e) => {
              const next = e.target.value ? Number(e.target.value) : null;
              if (next == null || !Number.isFinite(next)) return;
              if (!clubId) return;
              if (serverValue != null && next === serverValue) return;
              setErrByClub({ clubId, message: null });
              setLocalByClub({ clubId, value: next });
              patchMut.mutate(next);
            }}
            disabled={uiDisabled}
            aria-label={clubId ? `Change stars for ${club?.name ?? `#${clubId}`}` : "Select a club first"}
            title={clubId ? `Set stars for ${club?.name ?? `#${clubId}`}` : "Select a club first"}
          >
            <option value="">{clubId ? "—" : "Select club first"}</option>
            {STAR_OPTIONS.map((v) => (
              <option key={v} value={String(v)}>
                {starsLabel(v)}★
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <label className={cn("block", className)}>
      <ErrorToastOnError error={err} title="Could not update club stars" />
      <div className="input-label">{label}</div>
      <select
        className="select-field"
        value={effectiveValue == null ? "" : String(effectiveValue)}
        onChange={(e) => {
          const next = e.target.value ? Number(e.target.value) : null;
          if (next == null || !Number.isFinite(next)) return;
          if (!clubId) return;
          if (serverValue != null && next === serverValue) return;
          setErrByClub({ clubId, message: null });
          setLocalByClub({ clubId, value: next });
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
    </label>
  );
}
