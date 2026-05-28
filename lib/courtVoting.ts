import { supabase } from './supabase';

export type VoteType = 'verify' | 'flag' | null;

export type CourtVoteState = {
  myVote: VoteType;
  verifyCount: number;
  flagCount: number;
  verified: boolean;
  flaggedForReview: boolean;
  subscriberCount: number;
  verifyThreshold: number;
  flagThreshold: number;
};

export function computeVoteThresholds(subscriberCount: number): {
  verifyThreshold: number;
  flagThreshold: number;
} {
  return {
    verifyThreshold: Math.max(3, Math.ceil(subscriberCount * 0.2)),
    flagThreshold: Math.max(5, Math.ceil(subscriberCount * 0.3)),
  };
}

export function buildCourtVoteState(params: {
  verified?: boolean | null;
  flagged_for_review?: boolean | null;
  verify_count?: number | null;
  flag_count?: number | null;
  subscriberCount: number;
  myVote?: VoteType;
}): CourtVoteState {
  const thresholds = computeVoteThresholds(params.subscriberCount);
  return {
    myVote: params.myVote ?? null,
    verifyCount: params.verify_count ?? 0,
    flagCount: params.flag_count ?? 0,
    verified: params.verified ?? false,
    flaggedForReview: params.flagged_for_review ?? false,
    subscriberCount: params.subscriberCount,
    ...thresholds,
  };
}

export async function fetchCourtVoteState(
  courtId: string,
  userId: string | undefined,
): Promise<CourtVoteState | null> {
  const [courtRes, subCountRes, myVoteRes] = await Promise.all([
    supabase
      .from('courts')
      .select('verified, flagged_for_review, verify_count, flag_count')
      .eq('id', courtId)
      .single(),
    supabase
      .from('court_subscriptions')
      .select('court_id', { count: 'exact', head: true })
      .eq('court_id', courtId),
    userId
      ? supabase
          .from('court_votes')
          .select('vote_type')
          .eq('court_id', courtId)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (courtRes.error) return null;

  const subscribers = subCountRes.count ?? 0;
  const thresholds = computeVoteThresholds(subscribers);
  const c = courtRes.data;

  return {
    myVote: (myVoteRes.data?.vote_type as VoteType) ?? null,
    verifyCount: c.verify_count ?? 0,
    flagCount: c.flag_count ?? 0,
    verified: c.verified ?? false,
    flaggedForReview: c.flagged_for_review ?? false,
    subscriberCount: subscribers,
    ...thresholds,
  };
}

export async function castCourtVote(
  courtId: string,
  voteType: VoteType,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc('cast_court_vote', {
    p_court_id: courtId,
    p_vote_type: voteType,
  });
  if (error) return { ok: false, reason: error.message };
  const result = data as { ok: boolean; reason?: string };
  return result;
}

export type AdminFlaggedCourtRow = {
  id: string;
  name: string | null;
  address: string | null;
  verify_count: number;
  flag_count: number;
  flagged_for_review: boolean;
  verified: boolean;
};

export async function fetchFlaggedCourts(): Promise<
  { ok: true; courts: AdminFlaggedCourtRow[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('admin_list_flagged_courts', {
    p_limit: 50,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, courts: (data ?? []) as AdminFlaggedCourtRow[] };
}

export async function clearCourtFlag(
  courtId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('admin_clear_court_flag', {
    p_court_id: courtId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function adminDeleteCourt(
  courtId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('admin_delete_court', {
    p_court_id: courtId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
