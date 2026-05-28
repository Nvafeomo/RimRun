/** Matches RLS policy in scripts/messages-edit-unsend.sql */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

export function canEditMessage(
  message: { created_at: string; deleted_at?: string | null },
  now = Date.now(),
): boolean {
  if (message.deleted_at) return false;
  return now - new Date(message.created_at).getTime() < MESSAGE_EDIT_WINDOW_MS;
}

export function canUnsendMessage(message: {
  deleted_at?: string | null;
}): boolean {
  return !message.deleted_at;
}
