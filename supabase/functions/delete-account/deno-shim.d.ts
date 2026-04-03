/**
 * Minimal Deno surface for Supabase Edge Functions.
 * The real runtime is Deno on Supabase; Expo/Node tooling does not ship Deno types.
 */
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (
    handler: (req: Request) => Response | Promise<Response>,
  ) => void;
};
