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
    const msg = error.message ?? 'Report failed';
    if (error.code === 'PGRST202' || /could not find.*function/i.test(msg)) {
      return {
        ok: false,
        error:
          'Reporting is not set up on the server yet. Run scripts/reporting-and-chat-suspensions.sql in Supabase, then reload the API schema.',
      };
    }
    return { ok: false, error: msg };
  }

  const row = data as { ok?: boolean; deduped?: boolean } | null;
  if (row && typeof row === 'object' && row.ok === false) {
    return { ok: false, error: 'Report failed' };
  }

  return { ok: true, deduped: row?.deduped === true };
}
