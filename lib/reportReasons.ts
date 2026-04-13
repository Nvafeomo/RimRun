/** Must match submit_content_report CHECK / DB validation. */
export const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'spam', label: 'Spam or scam' },
  { value: 'hate', label: 'Hate or discrimination' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'minor_safety', label: 'Concern for a minor' },
  { value: 'self_harm', label: 'Self-harm or danger' },
  { value: 'other', label: 'Other' },
] as const;

export type ReportReasonValue = (typeof REPORT_REASONS)[number]['value'];
