/** Max lengths for user-generated text (client + server should agree). */
export const INPUT_LIMITS = {
  chatMessage: 2000,
  reportDetails: 2000,
  banAppeal: 2000,
  banReason: 500,
  email: 254,
  identifier: 200,
} as const;

/** Max JSON body size for Edge Functions (bytes). */
export const MAX_EDGE_BODY_BYTES = 8192;
