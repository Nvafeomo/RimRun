import { INPUT_LIMITS } from './constants';

/** Strip dangerous control chars and enforce max length. */
export function sanitizePlainText(input: string, maxLength: number): string {
  return input
    .replace(/\0/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeChatMessage(input: string): string {
  return sanitizePlainText(input, INPUT_LIMITS.chatMessage);
}

export function sanitizeReportDetails(input: string | undefined): string | null {
  if (!input?.trim()) return null;
  const cleaned = sanitizePlainText(input, INPUT_LIMITS.reportDetails);
  return cleaned || null;
}

export function sanitizeBanAppealMessage(input: string): string {
  return sanitizePlainText(input, INPUT_LIMITS.banAppeal);
}

export function sanitizeEmail(input: string): string {
  return input.trim().toLowerCase().slice(0, INPUT_LIMITS.email);
}
