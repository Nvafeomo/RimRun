const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_BODY_BYTES = 8192;

export function getCorsHeaders(): Record<string, string> {
  const allowed = Deno.env.get("ALLOWED_ORIGINS")?.trim();
  const origin = allowed && allowed !== "*" ? allowed.split(",")[0].trim() : "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

export function jsonResponse(
  corsHeaders: Record<string, string>,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function sanitizeText(value: string | undefined, maxLength: number): string {
  if (!value) return "";
  return value
    .replace(/\0/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

/** Read JSON body with size cap. Returns null on invalid/oversized input. */
export async function readJsonBody<T extends Record<string, unknown>>(
  req: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<T | null> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return null;
  }

  const raw = await req.text();
  if (raw.length > maxBytes) return null;
  if (!raw.trim()) return {} as T;

  try {
    const parsed = JSON.parse(raw) as T;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
