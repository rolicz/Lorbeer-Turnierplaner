import { Bell, CircleCheck, HandFist, ImageIcon, Loader2, Mail, Trash2, UserPen } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import Button from "../../ui/primitives/Button";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import CupOwnerBadge from "../../ui/primitives/CupOwnerBadge";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import CommentImageCropper from "../../ui/primitives/CommentImageCropper";
import ImageLightbox from "../../ui/primitives/ImageLightbox";

import { deletePlayerAvatar, playerAvatarUrl, putPlayerAvatar } from "../../api/playerAvatars.api";
import {
  deletePlayerHeaderImage,
  playerHeaderImageUrl,
  putPlayerHeaderImage,
} from "../../api/playerHeaders.api";
import { qk } from "../../api/queryKeys";
import { usePlayerHeaderMap } from "../../hooks/usePlayerHeaderMap";
import PlayerAvatarEditor from "../players/PlayerAvatarEditor";
import { type useProfilePokes } from "./useProfilePokes";

type ProfilePokes = ReturnType<typeof useProfilePokes>;

/**
 * Profile identity header: banner, avatar, name + cup badges, guestbook/poke
 * counts, unread notification lines, the anpöbeln button, and (own profile)
 * the avatar/header editors. Owns avatar/header upload mutations + lightboxes.
 */
export default function ProfileHeader({
  targetPlayerId,
  token,
  canEdit,
  isOwnProfile,
  displayName,
  avatarUpdatedAt,
  profileHeaderUpdatedAt,
  ownedCups,
  totalGuestbookCount,
  unreadGuestbookCount,
  unreadGuestbookAuthorsText,
  unreadGuestbookAuthorCount,
  pokes,
}: {
  targetPlayerId: number;
  token: string | null;
  canEdit: boolean;
  isOwnProfile: boolean;
  displayName: string | null;
  avatarUpdatedAt: string | null;
  profileHeaderUpdatedAt: string | null;
  ownedCups: { key: string; name: string }[];
  totalGuestbookCount: number;
  unreadGuestbookCount: number;
  unreadGuestbookAuthorsText: string;
  unreadGuestbookAuthorCount: number;
  pokes: ProfilePokes;
}) {
  const qc = useQueryClient();
  const { headerUpdatedAtById: headerUpdatedAtByPlayerId } = usePlayerHeaderMap();

  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [headerEditorOpen, setHeaderEditorOpen] = useState(false);
  const [avatarLightboxSrc, setAvatarLightboxSrc] = useState<string | null>(null);
  const [headerLightboxSrc, setHeaderLightboxSrc] = useState<string | null>(null);

  const avatarImageSrc = avatarUpdatedAt ? playerAvatarUrl(targetPlayerId, avatarUpdatedAt) : null;
  const headerUpdatedAt = headerUpdatedAtByPlayerId.get(targetPlayerId) ?? profileHeaderUpdatedAt ?? null;
  const headerImageSrc = headerUpdatedAt ? playerHeaderImageUrl(targetPlayerId, headerUpdatedAt) : null;

  const { unreadPokeCount, unreadPokeAuthorsText, totalPokeCount, canPokeAsActor, pokeFlashKind, pokeMut, markPokesReadAllMut } =
    pokes;

  const putAvatarMut = useMutation({
    mutationFn: async (blob: Blob) => {
      if (!token) throw new Error("Not logged in");
      if (!targetPlayerId) throw new Error("Invalid player");
      return putPlayerAvatar(token, targetPlayerId, blob);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.playerAvatars() });
    },
  });

  const delAvatarMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!targetPlayerId) throw new Error("Invalid player");
      await deletePlayerAvatar(token, targetPlayerId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.playerAvatars() });
    },
  });

  const putHeaderMut = useMutation({
    mutationFn: async (blob: Blob) => {
      if (!token) throw new Error("Not logged in");
      if (!targetPlayerId) throw new Error("Invalid player");
      return putPlayerHeaderImage(token, targetPlayerId, blob);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.playerHeaders() });
      await qc.invalidateQueries({ queryKey: qk.playerProfile(targetPlayerId ?? "none") });
      await qc.invalidateQueries({ queryKey: qk.playerProfiles() });
    },
  });

  const delHeaderMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!targetPlayerId) throw new Error("Invalid player");
      await deletePlayerHeaderImage(token, targetPlayerId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.playerHeaders() });
      await qc.invalidateQueries({ queryKey: qk.playerProfile(targetPlayerId ?? "none") });
      await qc.invalidateQueries({ queryKey: qk.playerProfiles() });
    },
  });

  return (
    <>
      <ErrorToastOnError error={putAvatarMut.error} title="Could not save avatar" />
      <ErrorToastOnError error={delAvatarMut.error} title="Could not delete avatar" />
      <ErrorToastOnError error={putHeaderMut.error} title="Could not save header image" />
      <ErrorToastOnError error={delHeaderMut.error} title="Could not delete header image" />

      {/* Identity / title page (always visible) */}
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-xl border border-border-card-inner/60 bg-bg-card-inner">
          {headerImageSrc ? (
            <button type="button" className="block w-full" onClick={() => setHeaderLightboxSrc(headerImageSrc)} title="Open header image">
              <img
                src={headerImageSrc}
                alt=""
                /* 16:9 is the crop the editor produces; `max-h-64` only bites on a wide
                   viewport, where a full-width 16:9 banner ate 62% of the window and
                   pushed the tab strip off the fold (A7). A phone is unchanged (16:9 of
                   390px is 219px), and the whole image is one tap away in the lightbox. */
                className="w-full max-h-64 object-cover object-center aspect-[16/9] cursor-zoom-in"
                loading="lazy"
                decoding="async"
              />
            </button>
          ) : (
            <div className="aspect-[16/9] max-h-64 grid place-items-center text-sm text-text-muted bg-bg-card-chip/25">
              No header image
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {avatarImageSrc ? (
            <button
              type="button"
              className="shrink-0 rounded-full cursor-zoom-in"
              title="Open avatar"
              onClick={() => setAvatarLightboxSrc(avatarImageSrc)}
            >
              <AvatarCircle
                playerId={targetPlayerId}
                name={displayName ?? String(targetPlayerId)}
                updatedAt={avatarUpdatedAt}
                sizeClass="h-14 w-14"
                cups={ownedCups}
              />
            </button>
          ) : (
            <AvatarCircle
              playerId={targetPlayerId}
              name={displayName ?? String(targetPlayerId)}
              updatedAt={avatarUpdatedAt}
              sizeClass="h-14 w-14"
              cups={ownedCups}
            />
          )}
          <div className="min-w-0">
            <div className="min-w-0 flex items-center gap-2">
              <span className="truncate text-base font-semibold text-text-normal">
                {displayName ?? `Player #${targetPlayerId}`}
              </span>
              {ownedCups.length ? (
                <span className="inline-flex items-center gap-1.5">
                  {ownedCups.map((c) => (
                    <CupOwnerBadge key={c.key} cupKey={c.key} cupName={c.name} />
                  ))}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-text-muted">{isOwnProfile ? "This is your profile" : "Public profile"}</div>
            <div className="mt-0.5 text-xs text-text-muted">
              {isOwnProfile ? (
                <>
                  Guestbook: <span className="tabular-nums text-text-normal">{totalGuestbookCount}</span> · Angepöbelt:{" "}
                  <span className="tabular-nums text-text-normal">{totalPokeCount}</span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <HandFist size={12} aria-hidden="true" />
                  <span>
                    Angepöbelt: <span className="tabular-nums text-text-normal">{totalPokeCount}</span>
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="ml-auto shrink-0">
            <div className="flex items-center gap-2">
              {isOwnProfile && unreadPokeCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (markPokesReadAllMut.isPending) return;
                    void markPokesReadAllMut.mutateAsync();
                  }}
                  disabled={markPokesReadAllMut.isPending}
                  title="Mark all anpöbel notifications as read"
                  className="h-9 w-9 p-0 inline-flex items-center justify-center active:scale-95"
                >
                  {markPokesReadAllMut.isPending ? (
                    <Loader2 size={14} className="animate-spin text-accent" aria-hidden="true" />
                  ) : pokeFlashKind === "read" ? (
                    <CircleCheck size={14} className="text-accent" aria-hidden="true" />
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Bell size={14} className="text-accent" aria-hidden="true" />
                      <span className="text-xs tabular-nums text-text-normal">{unreadPokeCount}</span>
                    </span>
                  )}
                </Button>
              ) : null}

              {canEdit ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setHeaderEditorOpen(true)}
                    title={headerImageSrc ? "Edit header image" : "Upload header image"}
                  >
                    <ImageIcon size={14} className="md:hidden" aria-hidden="true" />
                    <span className="hidden md:inline">{headerImageSrc ? "Edit header" : "Upload header"}</span>
                  </Button>
                  {headerImageSrc ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        void delHeaderMut.mutateAsync();
                      }}
                      title="Delete header image"
                      className="h-9 w-9 p-0 inline-flex items-center justify-center"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" onClick={() => setAvatarEditorOpen(true)} title="Edit avatar">
                    <UserPen size={14} className="md:hidden" aria-hidden="true" />
                    <span className="hidden md:inline">Edit avatar</span>
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="pt-1 space-y-1">
          {isOwnProfile && unreadGuestbookCount > 0 ? (
            <div className="inline-flex max-w-full items-center gap-1.5 text-xs text-text-muted">
              <Mail size={12} className="shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate">
                New guestbook: <span className="tabular-nums text-accent">{unreadGuestbookCount}</span>
                {unreadGuestbookAuthorsText
                  ? ` · ${unreadGuestbookAuthorCount > 1 ? `(${unreadGuestbookAuthorCount}) ` : ""}${unreadGuestbookAuthorsText}`
                  : ""}
              </span>
            </div>
          ) : null}
          <div className="inline-flex max-w-full items-center gap-1.5 text-xs text-text-muted">
            <Bell
              size={12}
              className={"shrink-0 " + (unreadPokeCount > 0 ? "text-accent" : "text-text-muted")}
              aria-hidden="true"
            />
            <span className="truncate">
              New Angepöbelt from:{" "}
              {unreadPokeCount > 0 ? (
                <span className="text-accent">{unreadPokeAuthorsText}</span>
              ) : (
                <span className="tabular-nums text-text-normal">0</span>
              )}
            </span>
          </div>
        </div>
        {canPokeAsActor ? (
          <div className="pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (pokeMut.isPending) return;
                void pokeMut.mutateAsync();
              }}
              disabled={pokeMut.isPending}
              title="Anpöbeln"
              className="active:scale-95 w-full sm:w-auto sm:ml-auto sm:flex"
            >
              <span className="inline-flex items-center gap-2">
                {pokeMut.isPending ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : pokeFlashKind === "sent" ? (
                  <CircleCheck size={14} className="text-accent" aria-hidden="true" />
                ) : (
                  <HandFist size={14} aria-hidden="true" />
                )}
                <span>
                  {pokeMut.isPending
                    ? "Anpöbeln…"
                    : pokeFlashKind === "sent"
                      ? "Gesendet"
                      : "Anpöbeln"}
                </span>
              </span>
            </Button>
          </div>
        ) : null}
      </div>

      <PlayerAvatarEditor
        open={avatarEditorOpen}
        title="Edit avatar"
        canEdit={canEdit}
        onClose={() => setAvatarEditorOpen(false)}
        onSave={async (blob) => {
          await putAvatarMut.mutateAsync(blob);
        }}
        onDelete={
          canEdit && avatarUpdatedAt
            ? async () => {
                await delAvatarMut.mutateAsync();
              }
            : null
        }
      />

      <CommentImageCropper
        open={headerEditorOpen}
        title="Edit profile header"
        aspectW={16}
        aspectH={9}
        outputWidth={1920}
        outputHeight={1080}
        hint="Crop 16:9 · exported as 1920x1080"
        onClose={() => setHeaderEditorOpen(false)}
        onApply={async (blob) => {
          await putHeaderMut.mutateAsync(blob);
        }}
      />

      <ImageLightbox open={!!avatarLightboxSrc} src={avatarLightboxSrc} onClose={() => setAvatarLightboxSrc(null)} />
      <ImageLightbox open={!!headerLightboxSrc} src={headerLightboxSrc} onClose={() => setHeaderLightboxSrc(null)} />
    </>
  );
}
