import { Bell, CircleCheck, HandFist, ImageIcon, Loader2, Mail, Pencil, Trash2, UserPen } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import Button from "../../ui/primitives/Button";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import CommentImageCropper from "../../ui/primitives/CommentImageCropper";
import ImageLightbox from "../../ui/primitives/ImageLightbox";
import Modal from "../../ui/primitives/Modal";
import { List, ListRow } from "../../ui/primitives/List";

import { deletePlayerAvatar, playerAvatarUrl, putPlayerAvatar } from "../../api/playerAvatars.api";
import {
  deletePlayerHeaderImage,
  playerHeaderImageUrl,
  putPlayerHeaderImage,
} from "../../api/playerHeaders.api";
import { qk } from "../../api/queryKeys";
import type { GuestbookSubjectKind, StatsRecord } from "../../api/types";
import { usePlayerHeaderMap } from "../../hooks/usePlayerHeaderMap";
import PlayerAvatarEditor from "../players/PlayerAvatarEditor";
import RecordBadges from "./RecordBadges";
import SubjectCommentTrigger from "./SubjectCommentTrigger";
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
  records,
  subjectCounts,
  canPostGuestbook,
  onCommentOn,
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
  records: StatsRecord[];
  /** Guestbook entries about the *current* version of each item (K3). */
  subjectCounts: Record<GuestbookSubjectKind, number>;
  canPostGuestbook: boolean;
  onCommentOn: (kind: GuestbookSubjectKind) => void;
}) {
  const qc = useQueryClient();
  const { headerUpdatedAtById: headerUpdatedAtByPlayerId } = usePlayerHeaderMap();

  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [headerEditorOpen, setHeaderEditorOpen] = useState(false);
  const [avatarLightboxSrc, setAvatarLightboxSrc] = useState<string | null>(null);
  const [headerLightboxSrc, setHeaderLightboxSrc] = useState<string | null>(null);
  const [pendingDeleteHeader, setPendingDeleteHeader] = useState<true | null>(null);
  const [picturesSheetOpen, setPicturesSheetOpen] = useState(false);

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
      // `current` on every subject chip is a fact about this profile, and the guestbook
      // list is what carries it (K3): the owner's own chips flip to "Earlier …" with the
      // upload, not 5 s later when the window goes stale.
      await qc.invalidateQueries({ queryKey: qk.playerGuestbook(targetPlayerId) });
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
      // `current` on every subject chip is a fact about this profile, and the guestbook
      // list is what carries it (K3): the owner's own chips flip to "Earlier …" with the
      // upload, not 5 s later when the window goes stale.
      await qc.invalidateQueries({ queryKey: qk.playerGuestbook(targetPlayerId) });
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
      // `current` on every subject chip is a fact about this profile, and the guestbook
      // list is what carries it (K3): the owner's own chips flip to "Earlier …" with the
      // upload, not 5 s later when the window goes stale.
      await qc.invalidateQueries({ queryKey: qk.playerGuestbook(targetPlayerId) });
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
      // `current` on every subject chip is a fact about this profile, and the guestbook
      // list is what carries it (K3): the owner's own chips flip to "Earlier …" with the
      // upload, not 5 s later when the window goes stale.
      await qc.invalidateQueries({ queryKey: qk.playerGuestbook(targetPlayerId) });
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
        {/* The banner is the 16:9 crop the editor produced, shown whole and at the full
            width of the page — no `max-h` (that cropped the picture Roli framed) and no
            width cap either: "its left aligned and does not fully fill the width" (R2c).
            The accepted cost, stated and waved through: at 1280×900 the banner is ~557px
            tall and the tab strip below it sits near the fold. */}
        <div className="relative w-full overflow-hidden rounded-xl border border-border-card-inner/60 bg-bg-card-inner">
          {headerImageSrc ? (
            <button type="button" className="block w-full" onClick={() => setHeaderLightboxSrc(headerImageSrc)} title="Open header image">
              <img
                src={headerImageSrc}
                alt=""
                className="w-full object-cover aspect-[16/9] cursor-zoom-in"
                loading="lazy"
                decoding="async"
              />
            </button>
          ) : (
            <div className="aspect-[16/9] grid place-items-center text-sm text-text-muted bg-bg-card-chip/25">
              No header image
            </div>
          )}
          {/* The second way in, and the only one that shows without a tap (Roli 2026-09-19,
              overruling the plan's "lightbox only"). It is `absolute` inside the banner's own
              box on purpose: M8 and M9 spent two tasks taking height out of this header, so a
              badge that took part in the flow would push the identity block and the tab strip
              back down. It says nothing at all at zero. */}
          {headerImageSrc ? (
            <SubjectCommentTrigger
              kind="header_image"
              count={subjectCounts.header_image}
              canPost={canPostGuestbook}
              variant="overlay"
              onOpen={onCommentOn}
              className="absolute bottom-2 right-2 z-10"
            />
          ) : null}
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
                sizeClass="h-20 w-20"
                fallbackClassName="text-lg font-semibold text-text-muted"
                cups={ownedCups}
              />
            </button>
          ) : (
            <AvatarCircle
              playerId={targetPlayerId}
              name={displayName ?? String(targetPlayerId)}
              updatedAt={avatarUpdatedAt}
              sizeClass="h-20 w-20"
              fallbackClassName="text-lg font-semibold text-text-muted"
              cups={ownedCups}
            />
          )}
          <div className="min-w-0">
            <div className="min-w-0 flex items-center gap-2">
              <span className="truncate text-lg font-semibold text-text-normal">
                {displayName ?? `Player #${targetPlayerId}`}
              </span>
            </div>
            <RecordBadges playerId={targetPlayerId} records={records} />
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

              {/* One control, not three (M8, Roli: "i want to see my page as if someone else
                  visits my page plus one edit button or so"). The three ghost buttons that used
                  to sit here took 144px of a 278px text column, which is why the owner's badge
                  band wrapped a row earlier than a visitor's. The three actions live in the sheet
                  it opens; the delete keeps its `ConfirmDialog` (C7). */}
              {canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPicturesSheetOpen(true)}
                  title="Edit profile pictures"
                  aria-label="Edit profile pictures"
                  data-edit-pictures
                  className="h-9 w-9 p-0 inline-flex items-center justify-center"
                >
                  <Pencil size={14} aria-hidden="true" />
                </Button>
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

      {/* The one edit affordance's sheet: the three picture actions, each opening the editor it
          names. It closes as it hands over, so two overlays are never stacked, and "Delete header
          image" still goes through `ConfirmDialog` below — the sheet is a chooser, not a shortcut
          past the confirmation (C7). No chevron: these rows open an overlay on this page, and that
          glyph promises navigation (`DESIGN.md` §9b). */}
      <Modal
        open={picturesSheetOpen}
        title="Profile pictures"
        subtitle="Your header image and avatar."
        onClose={() => setPicturesSheetOpen(false)}
        maxWidth="max-w-md"
      >
        <div data-profile-pictures>
          <List>
            <ListRow
              onClick={() => {
                setPicturesSheetOpen(false);
                setHeaderEditorOpen(true);
              }}
              chevron={false}
              leading={<ImageIcon size={16} className="text-text-muted" aria-hidden="true" />}
              title={headerImageSrc ? "Edit header image" : "Upload header image"}
              subtitle="The 16:9 banner at the top of the profile."
            />
            {headerImageSrc ? (
              <ListRow
                onClick={() => {
                  setPicturesSheetOpen(false);
                  setPendingDeleteHeader(true);
                }}
                chevron={false}
                leading={<Trash2 size={16} className="text-error" aria-hidden="true" />}
                title="Delete header image"
                subtitle="The profile shows the placeholder instead."
              />
            ) : null}
            <ListRow
              onClick={() => {
                setPicturesSheetOpen(false);
                setAvatarEditorOpen(true);
              }}
              chevron={false}
              leading={<UserPen size={16} className="text-text-muted" aria-hidden="true" />}
              title="Edit avatar"
              subtitle="The round picture beside your name."
            />
          </List>
        </div>
      </Modal>

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

      {/* The picture's own "comment on this": the lightbox closes as it hands over, so the
          armed composer is not left behind an overlay. */}
      <ImageLightbox
        open={!!avatarLightboxSrc}
        src={avatarLightboxSrc}
        onClose={() => setAvatarLightboxSrc(null)}
        footer={
          <SubjectCommentTrigger
            kind="avatar"
            count={subjectCounts.avatar}
            canPost={canPostGuestbook}
            variant="solid"
            onOpen={(kind) => {
              setAvatarLightboxSrc(null);
              onCommentOn(kind);
            }}
          />
        }
      />
      <ImageLightbox
        open={!!headerLightboxSrc}
        src={headerLightboxSrc}
        onClose={() => setHeaderLightboxSrc(null)}
        footer={
          <SubjectCommentTrigger
            kind="header_image"
            count={subjectCounts.header_image}
            canPost={canPostGuestbook}
            variant="solid"
            onOpen={(kind) => {
              setHeaderLightboxSrc(null);
              onCommentOn(kind);
            }}
          />
        }
      />

      <ConfirmDialog
        open={!!pendingDeleteHeader}
        title="Delete the header image?"
        subtitle="The profile shows the placeholder until a new image is uploaded."
        confirmLabel="Delete header image"
        onCancel={() => setPendingDeleteHeader(null)}
        onConfirm={() => {
          setPendingDeleteHeader(null);
          void delHeaderMut.mutateAsync();
        }}
      >
        <div>The current image is removed for good.</div>
      </ConfirmDialog>
    </>
  );
}
