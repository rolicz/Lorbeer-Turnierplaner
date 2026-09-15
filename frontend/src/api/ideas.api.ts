import { apiFetch, apiUpload, mediaUrl } from "./client";
import type {
  Idea,
  IdeaAreasResponse,
  IdeaKind,
  IdeaListResponse,
  IdeaStatus,
  VoteVotersResponse,
} from "./types";

export function listIdeas(token?: string | null): Promise<IdeaListResponse> {
  return apiFetch(`/ideas`, { method: "GET", token: token ?? undefined });
}

/** The area catalog is served, never mirrored here: a retired area still has to label old ideas. */
export function listIdeaAreas(): Promise<IdeaAreasResponse> {
  return apiFetch(`/ideas/areas`, { method: "GET" });
}

export function createIdea(
  token: string,
  body: { title: string; body: string; kind: IdeaKind; areas: string[] },
): Promise<Idea> {
  return apiFetch(`/ideas`, { method: "POST", token, body: JSON.stringify(body) });
}

export function patchIdea(
  token: string,
  ideaId: number,
  body: { title?: string; body?: string; kind?: IdeaKind; areas?: string[] },
): Promise<Idea> {
  return apiFetch(`/ideas/${ideaId}`, { method: "PATCH", token, body: JSON.stringify(body) });
}

export function setIdeaStatus(
  token: string,
  ideaId: number,
  body: { status: IdeaStatus; note?: string },
): Promise<Idea> {
  return apiFetch(`/ideas/${ideaId}/status`, { method: "PUT", token, body: JSON.stringify(body) });
}

/** A "+1", toggled: 1 adds this player's vote, 0 takes it back. Never -1. */
export function voteIdea(token: string, ideaId: number, value: 0 | 1): Promise<{ ok: boolean; value: number }> {
  return apiFetch(`/ideas/${ideaId}/vote`, { method: "PUT", token, body: JSON.stringify({ value }) });
}

export function listIdeaVoters(ideaId: number): Promise<VoteVotersResponse> {
  return apiFetch(`/ideas/${ideaId}/voters`, { method: "GET" });
}

export function deleteIdea(token: string, ideaId: number) {
  return apiFetch<{ ok: boolean }>(`/ideas/${ideaId}`, { method: "DELETE", token });
}

export function ideaImageUrl(ideaId: number, updatedAt?: string | null): string {
  return mediaUrl(`/ideas/${ideaId}/image`, updatedAt);
}

export async function putIdeaImage(
  token: string,
  ideaId: number,
  blob: Blob,
  filename = "idea.webp",
): Promise<Idea> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  return apiUpload(`/ideas/${ideaId}/image`, { token, body: fd });
}

export function deleteIdeaImage(token: string, ideaId: number) {
  return apiFetch<{ ok: boolean }>(`/ideas/${ideaId}/image`, { method: "DELETE", token });
}
