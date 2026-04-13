import { supabase } from './supabase';
import type { ReportReasonValue } from './reportReasons';

export type SubmitReportParams = {
  reason: ReportReasonValue;
  details?: string;
  reportedUserId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  courtId?: string | null;
};

export async function submitContentReport(
  params: SubmitReportParams,
): Promise<{ ok: true; deduped?: boolean } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('submit_content_report', {
    p_reason: params.reason,
    p_details: params.details?.trim() || null,
    p_reported_user_id: params.reportedUserId ?? null,
    p_conversation_id: params.conversationId ?? null,
    p_message_id: params.messageId ?? null,
    p_court_id: params.courtId ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as { ok?: boolean; deduped?: boolean } | null;
  if (row && typeof row === 'object' && row.ok === false) {
    return { ok: false, error: 'Report failed' };
  }

  return { ok: true, deduped: row?.deduped === true };
}
