/**
 * Reject if a promise does not settle within `ms` milliseconds.
 *
 * The underlying promise is not cancelled; its result is simply ignored after the timeout.
 *
 * @param promise - Promise (or thenable, e.g. a Supabase query builder) to wait on.
 * @param ms - Timeout in milliseconds.
 * @param label - Prefix for the timeout error message (defaults to "Request").
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label = 'Request'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
