/// <reference path="./deno-shim.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

/** Comma-separated auth user UUIDs allowed to ban (fallback if profiles.role is not admin). */
const ADMIN_USER_IDS = (Deno.env.get("ADMIN_USER_IDS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type BanRequestBody = {
  user_id?: string;
  reason?: string;
  expires_at?: string | null;
  report_id?: string | null;
};

Deno.serve(async (req) => {
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
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing authorization" }, 401);
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return json({ error: "Missing authorization" }, 401);
  }

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error: userError,
  } = await supabaseAuth.auth.getUser(token);
  if (userError || !user) {
    console.error("getUser error:", userError?.message ?? "no user");
    return json({ error: "Unauthorized" }, 401);
  }

  if (!SERVICE_ROLE_KEY) {
    console.error("Missing SERVICE_ROLE_KEY for admin client");
    return json({ error: "Server misconfigured" }, 500);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("profiles lookup error:", profileError.message);
    return json({ error: "Failed to verify admin" }, 500);
  }

  const isAdmin =
    callerProfile?.role === "admin" || ADMIN_USER_IDS.includes(user.id);
  if (!isAdmin) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: BanRequestBody = {};
  try {
    const raw = await req.text();
    if (raw.trim()) {
      body = JSON.parse(raw) as BanRequestBody;
    }
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const targetUserId = body.user_id?.trim();
  if (!targetUserId) {
    return json({ error: "user_id is required" }, 400);
  }

  if (targetUserId === user.id) {
    return json({ error: "Cannot ban yourself" }, 400);
  }

  const expiresAt =
    body.expires_at && body.expires_at.trim() ? body.expires_at.trim() : null;

  const { error: banError } = await supabaseAdmin.rpc("ban_user", {
    p_user_id: targetUserId,
    p_banned_by: user.id,
    p_reason: body.reason?.trim() || null,
    p_expires_at: expiresAt,
  });

  if (banError) {
    console.error("ban_user error:", banError.message);
    return json({ error: banError.message }, 500);
  }

  if (body.report_id?.trim()) {
    const { error: reportError } = await supabaseAdmin
      .from("content_reports")
      .update({ status: "action_taken" })
      .eq("id", body.report_id.trim());
    if (reportError) {
      console.warn("report status update failed:", reportError.message);
    }
  }

  try {
    await supabaseAdmin.auth.admin.signOut(targetUserId, "global");
  } catch (signOutErr) {
    console.warn("global signOut after ban:", signOutErr);
  }

  return json({ success: true });
});
