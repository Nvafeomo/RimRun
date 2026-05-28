function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Compact timestamp for chat thread list rows. */
export function formatChatListTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return "Now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m`;

  const today = startOfDay(now).getTime();
  const messageDay = startOfDay(date).getTime();
  const dayDiff = Math.round((today - messageDay) / 86_400_000);

  if (dayDiff === 0) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
