const BEARER_PATTERN = /bearer\s+[a-z0-9._-]+/gi;
const EMAIL_PATTERN = /([a-zA-Z0-9._%+-]{1,3})[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

function redactString(value: string): string {
  return value
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(/password[=:]\s*\S+/gi, 'password=[redacted]')
    .replace(/token[=:]\s*\S+/gi, 'token=[redacted]')
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=[redacted]')
    .replace(EMAIL_PATTERN, '$1***@$2');
}

/** Safe string for console.error — strips tokens, passwords, partial emails. */
export function formatErrorForLog(err: unknown): string {
  let raw: string;
  if (err instanceof Error) {
    raw = err.message;
  } else if (typeof err === 'object' && err !== null) {
    const e = err as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    const parts = [e.message, e.code, e.details, e.hint].filter(Boolean);
    raw = parts.length > 0 ? parts.join(' | ') : JSON.stringify(err);
  } else {
    raw = String(err);
  }
  return redactString(raw);
}
