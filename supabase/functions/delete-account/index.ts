/// <reference path="./deno-shim.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
/** CLI cannot set names starting with SUPABASE_; use `SERVICE_ROLE_KEY` via `supabase secrets set`. */
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

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

  // Verify JWT with anon client + explicit token. Service role + getUser() often fails to resolve the end user.
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
    console.error("Missing SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) for admin client");
    return json({ error: "Server misconfigured" }, 500);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("Delete user error:", deleteError);
    // Wrong/missing service role in Edge secrets often surfaces as this exact message.
    const msg = deleteError.message ?? "delete failed";
    if (/invalid api key/i.test(msg)) {
      return json(
        {
          error:
            "Edge Function secret SERVICE_ROLE_KEY is wrong or not the service_role key for this project. Fix in Dashboard → Edge Functions → Secrets (not the app .env).",
        },
        500,
      );
    }
    return json({ error: msg }, 500);
  }

  return json({ success: true });
});
