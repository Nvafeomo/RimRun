/**
 * Shared blocked terms for client + server moderation.
 * Server list is seeded into `blocked_words` via chat-message-moderation.sql.
 * Keep in sync when adding terms here.
 */
export const BLOCKED_PHRASES = [
  'kill yourself',
  'kill urself',
  'kys',
  'go die',
  'go kill yourself',
  'i will kill you',
  "i'll kill you",
  'im gonna kill',
  "i'm gonna kill",
  'gonna kill you',
  'rape you',
  'send nudes',
  'send nude',
  'child porn',
  'cp link',
] as const;

/** Single tokens / stems — matched with word boundaries (client) or substring (server). */
export const BLOCKED_TERMS = [
  // Severe profanity
  'fuck',
  'fucking',
  'fucker',
  'motherfucker',
  'mf',
  'shit',
  'shitty',
  'bullshit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'whore',
  'slut',
  // Sexual / explicit
  'porn',
  'porno',
  'pornography',
  'hentai',
  'blowjob',
  'handjob',
  'dick',
  'cock',
  'penis',
  'vagina',
  'pussy',
  'boobs',
  'tits',
  'titty',
  'nude',
  'nudes',
  'naked',
  'onlyfans',
  'orgasm',
  'masturbate',
  'masturbating',
  'dildo',
  'anal',
  'bdsm',
  'fetish',
  'horny',
  'milf',
  'threesome',
  'gangbang',
  'cumshot',
  'cumming',
  'ejaculate',
  // Threat / violence
  'rape',
  'raping',
  'molest',
  'molester',
  'pedophile',
  'pedo',
  'predator',
  'lynch',
  // Slurs (zero tolerance)
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'retard',
  'retarded',
  'tranny',
] as const;

export type BlockedTerm = (typeof BLOCKED_TERMS)[number];
export type BlockedPhrase = (typeof BLOCKED_PHRASES)[number];
