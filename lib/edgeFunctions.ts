/** Parse JSON error bodies from Supabase Edge Functions. */
export async function messageFromEdgeFunctionFailure(
  error: unknown,
  response?: Response,
): Promise<string> {
  if (response) {
    try {
      const ct = response.headers.get('Content-Type') ?? '';
      if (ct.includes('application/json')) {
        const j = (await response.clone().json()) as { error?: string };
        if (typeof j?.error === 'string' && j.error.trim()) {
          return j.error;
        }
      }
      const text = (await response.clone().text()).trim();
      if (text) return text.slice(0, 400);
    } catch {
      /* ignore parse errors */
    }
    return `Request failed (HTTP ${response.status}).`;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}
