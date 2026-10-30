/** Matches RLS policy in scripts/messages-edit-unsend.sql */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

/** True if the message is not deleted and is still inside the edit window. */
export function canEditMessage(
  message: { created_at: string; deleted_at?: string | null },
  now = Date.now(),
): boolean {
  if (message.deleted_at) return false;
  return now - new Date(message.created_at).getTime() < MESSAGE_EDIT_WINDOW_MS;
}

/** True if the message has not already been unsent (soft-deleted). */
export function canUnsendMessage(message: {
  deleted_at?: string | null;
}): boolean {
  return !message.deleted_at;
}
