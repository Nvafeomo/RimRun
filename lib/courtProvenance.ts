import type { CourtDetailTagItem } from "../components/CourtDetailTags";

/** How long the "Recently added" heads-up stays visible. */
export const RECENTLY_ADDED_WINDOW_DAYS = 14;

export type CourtProvenanceFields = {
  source?: string | null;
  created_at?: string | null;
};

export function isCourtRecentlyAdded(
  createdAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const windowMs = RECENTLY_ADDED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return nowMs - created <= windowMs;
}

export function isCourtUserAdded(source: string | null | undefined): boolean {
  return source === "user";
}

export function buildCourtProvenanceTags(
  court: CourtProvenanceFields,
): CourtDetailTagItem[] {
  const tags: CourtDetailTagItem[] = [];
  if (isCourtRecentlyAdded(court.created_at)) {
    tags.push({
      key: "recent",
      label: "Recently added",
      variant: "warning",
    });
  }
  if (isCourtUserAdded(court.source)) {
    tags.push({
      key: "user-added",
      label: "User added",
      variant: "muted",
    });
  }
  return tags;
}
