/// <reference path="./deno-shim.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse } from "../_shared/httpSecurity";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
/** CLI cannot set names starting with SUPABASE_; use `SERVICE_ROLE_KEY` via `supabase secrets set`. */
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
    console.error("Missing SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) for admin client");
    return jsonResponse(corsHeaders, { error: "Server misconfigured" }, 500);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Remove the user's profile photos first; deleting the auth user does not
  // delete their files in Storage.
  await removeUserAvatarFiles(supabaseAdmin.storage, user.id);

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("Delete user error:", deleteError.message);
    const msg = deleteError.message ?? "delete failed";
    if (/invalid api key/i.test(msg)) {
      return jsonResponse(
        corsHeaders,
        { error: "Server misconfigured" },
        500,
      );
    }
    return jsonResponse(corsHeaders, { error: "Could not delete account" }, 500);
  }

  return jsonResponse(corsHeaders, { success: true });
});

/** Best-effort removal of everything under `{userId}/` in the Avatars bucket. */
async function removeUserAvatarFiles(
  storage: ReturnType<typeof createClient>["storage"],
  userId: string,
): Promise<void> {
  try {
    const { data: files, error: listError } = await storage
      .from("Avatars")
      .list(userId, { limit: 100 });
    if (listError) {
      console.warn("avatar list failed:", listError.message);
      return;
    }
    const paths = (files ?? []).map((file) => `${userId}/${file.name}`);
    if (paths.length === 0) return;
    const { error: removeError } = await storage.from("Avatars").remove(paths);
    if (removeError) {
      console.warn("avatar remove failed:", removeError.message);
    }
  } catch (err) {
    console.warn("avatar cleanup error:", err);
  }
}
