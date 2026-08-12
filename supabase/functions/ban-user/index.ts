/// <reference path="./deno-shim.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getCorsHeaders,
  isUuid,
  jsonResponse,
  readJsonBody,
  sanitizeText,
} from "../_shared/httpSecurity";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

/** Comma-separated auth user UUIDs allowed to ban (fallback if profiles.role is not admin). */
const ADMIN_USER_IDS = (Deno.env.get("ADMIN_USER_IDS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const MAX_REASON_LENGTH = 500;

type BanRequestBody = {
  user_id?: string;
  reason?: string;
  expires_at?: string | null;
  report_id?: string | null;
};

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders();

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(corsHeaders, { error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(corsHeaders, { error: "Missing authorization" }, 401);
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return jsonResponse(corsHeaders, { error: "Missing authorization" }, 401);
  }

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error: userError,
  } = await supabaseAuth.auth.getUser(token);
  if (userError || !user) {
    console.error("getUser error:", userError?.message ?? "no user");
    return jsonResponse(corsHeaders, { error: "Unauthorized" }, 401);
  }

  if (!SERVICE_ROLE_KEY) {
    console.error("Missing SERVICE_ROLE_KEY for admin client");
    return jsonResponse(corsHeaders, { error: "Server misconfigured" }, 500);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("profiles lookup error:", profileError.message);
    return jsonResponse(corsHeaders, { error: "Failed to verify admin" }, 500);
  }

  const isAdmin =
    callerProfile?.role === "admin" || ADMIN_USER_IDS.includes(user.id);
  if (!isAdmin) {
    return jsonResponse(corsHeaders, { error: "Forbidden" }, 403);
  }

  const body = await readJsonBody<BanRequestBody>(req);
  if (body === null) {
    return jsonResponse(corsHeaders, { error: "Invalid JSON body" }, 400);
  }

  const targetUserId = body.user_id?.trim() ?? "";
  if (!targetUserId || !isUuid(targetUserId)) {
    return jsonResponse(corsHeaders, { error: "Valid user_id is required" }, 400);
  }

  if (targetUserId === user.id) {
    return jsonResponse(corsHeaders, { error: "Cannot ban yourself" }, 400);
  }

  const expiresAt =
    body.expires_at && body.expires_at.trim() ? body.expires_at.trim() : null;

  const reason = sanitizeText(body.reason, MAX_REASON_LENGTH) || null;

  const reportId = body.report_id?.trim();
  if (reportId && !isUuid(reportId)) {
    return jsonResponse(corsHeaders, { error: "Invalid report_id" }, 400);
  }

  const { error: banError } = await supabaseAdmin.rpc("ban_user", {
    p_user_id: targetUserId,
    p_banned_by: user.id,
    p_reason: reason,
    p_expires_at: expiresAt,
  });

  if (banError) {
    console.error("ban_user error:", banError.message);
    return jsonResponse(corsHeaders, { error: "Ban action failed" }, 500);
  }

  if (reportId) {
    const { error: reportError } = await supabaseAdmin
      .from("content_reports")
      .update({ status: "action_taken" })
      .eq("id", reportId);
    if (reportError) {
      console.warn("report status update failed:", reportError.message);
    }
  }

  try {
    await supabaseAdmin.auth.admin.signOut(targetUserId, "global");
  } catch (signOutErr) {
    console.warn("global signOut after ban:", signOutErr);
  }

  return jsonResponse(corsHeaders, { success: true });
});
