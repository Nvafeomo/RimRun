import { supabase } from './supabase';
import { messageFromEdgeFunctionFailure } from './edgeFunctions';

export type AdminReportRow = {
  id: string;
  created_at: string;
  status: string;
  reason: string;
  details: string | null;
  reporter_username: string | null;
  reported_username: string | null;
  reporter_id: string;
  reported_user_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  court_id: string | null;
};

export async function fetchOpenReports(): Promise<
  { ok: true; reports: AdminReportRow[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('admin_list_open_reports', {
    p_limit: 50,
  });
  if (error) {
    const msg = error.message ?? 'Could not load reports';
    if (msg === 'Forbidden' || /forbidden/i.test(msg)) {
      return {
        ok: false,
        error:
          'Admin access denied. Confirm your profile role is admin in Supabase (profiles.role = \'admin\').',
      };
    }
    if (error.code === 'PGRST202' || /could not find.*function/i.test(msg)) {
      return {
        ok: false,
        error:
          'Moderation queue is not set up on the server yet. Run scripts/admin-moderation-app-rpc.sql in Supabase, then reload the API schema.',
      };
    }
    return { ok: false, error: msg };
  }
  return { ok: true, reports: (data ?? []) as AdminReportRow[] };
}

export async function dismissReport(
  reportId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('admin_update_report_status', {
    p_report_id: reportId,
    p_status: 'dismissed',
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type BanUserParams = {
  userId: string;
  reason?: string;
  reportId?: string;
};

export async function banUserViaEdge(
  params: BanUserParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { ok: false, error: 'Your session expired. Sign in again.' };
  }

  const { data, error, response } = await supabase.functions.invoke('ban-user', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      user_id: params.userId,
      reason: params.reason?.trim() || null,
      report_id: params.reportId ?? null,
    },
  });

  if (error) {
    const detail = await messageFromEdgeFunctionFailure(error, response);
    return { ok: false, error: detail };
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return { ok: false, error: String(data.error) };
  }
  return { ok: true };
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin';
}

export type AdminAppealRow = {
  id: string;
  created_at: string;
  message: string;
  user_id: string;
  username: string | null;
  ban_id: string | null;
};

export async function fetchPendingAppeals(): Promise<
  { ok: true; appeals: AdminAppealRow[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('admin_list_pending_appeals', {
    p_limit: 50,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, appeals: (data ?? []) as AdminAppealRow[] };
}

export async function reviewBanAppeal(
  appealId: string,
  decision: 'approved' | 'denied',
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('admin_review_appeal', {
    p_appeal_id: appealId,
    p_decision: decision,
    p_note: note?.trim() || null,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
