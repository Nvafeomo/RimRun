

export const MIN_ACCOUNT_AGE = 13;

export type AgeBracket = '13-15' | '16-17' | '18+';

/** ISO date YYYY-MM-DD only; invalid format returns null. */
export function parseIsoDateOnly(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}

/** Calendar date as local YYYY-MM-DD (avoids UTC shift from toISOString()). */
export function formatLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * Integer age in full years at `reference` (default: now, device local).
 * Birthdate is end-exclusive for the birthday: you turn N on the calendar day of birthday.
 */
export function ageInFullYears(
  dateOfBirthIso: string,
  reference: Date = new Date(),
): number | null {
  const parsed = parseIsoDateOnly(dateOfBirthIso);
  if (!parsed) return null;
  let age = reference.getFullYear() - parsed.y;
  const beforeBirthdayThisYear =
    reference.getMonth() < parsed.m - 1 ||
    (reference.getMonth() === parsed.m - 1 && reference.getDate() < parsed.d);
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

export function getAgeBracket(age: number): AgeBracket | null {
  if (age < MIN_ACCOUNT_AGE) return null;
  if (age <= 15) return '13-15';
  if (age <= 17) return '16-17';
  return '18+';
}

export type DateOfBirthValidationError =
  | 'required'
  | 'invalid_format'
  | 'future'
  | 'under_minimum_age';

export function validateDateOfBirthForSignup(
  dateOfBirthIso: string,
  reference: Date = new Date(),
): { ok: true; age: number; bracket: AgeBracket } | { ok: false; error: DateOfBirthValidationError } {
  const trimmed = dateOfBirthIso.trim();
  if (!trimmed) return { ok: false, error: 'required' };

  const parsed = parseIsoDateOnly(trimmed);
  if (!parsed) return { ok: false, error: 'invalid_format' };

  const birth = new Date(parsed.y, parsed.m - 1, parsed.d);
  const startOfRefDay = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
  );
  if (birth.getTime() > startOfRefDay.getTime()) return { ok: false, error: 'future' };

  const age = ageInFullYears(trimmed, reference);
  if (age === null) return { ok: false, error: 'invalid_format' };
  if (age < MIN_ACCOUNT_AGE) return { ok: false, error: 'under_minimum_age' };

  const bracket = getAgeBracket(age);
  if (!bracket) return { ok: false, error: 'under_minimum_age' };

  return { ok: true, age, bracket };
}

/** Latest calendar date a user can be born on to be at least MIN_ACCOUNT_AGE today (local). */
export function maxBirthDateForMinAge(reference: Date = new Date()): Date {
  const d = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  d.setFullYear(d.getFullYear() - MIN_ACCOUNT_AGE);
  return d;
}

/**
 * One-way check: does `viewerAge`'s policy allow interacting with `partnerAge`?
 * Assumes both users are app-eligible (>= 13). Mutual consent = both directions must pass.
 *
 * **DMs, friendships, non-court group chats** — and the same pairwise logic informs
 * court thread visibility (`court_pair_message_visible` in Postgres). Details:
 * `docs/personal/rimrun-age-safety-brackets.tex` (golden rule + verified professionals).
 *
 * Rules (viewer perspective):
 * - Both 13–17: partner in [max(13, viewer−3), viewer+3].
 * - Minor viewer + adult partner: partner must be a verified professional (coach/trainer/mentor).
 * - Adult viewer + minor partner: viewer must be a verified professional.
 * - Adult + adult (18+): allowed.
 *
 * `verifiedProfessional` defaults to false — server field `profiles.verified_professional`
 * gates adult–minor contact.
 */
export function allowsPartnerAge(
  viewerAge: number,
  partnerAge: number,
  viewerVerifiedProfessional = false,
  partnerVerifiedProfessional = false,
): boolean {
  if (viewerAge < MIN_ACCOUNT_AGE || partnerAge < MIN_ACCOUNT_AGE) return false;

  const viewerMinor = viewerAge <= 17;
  const partnerMinor = partnerAge <= 17;

  if (viewerMinor && partnerMinor) {
    const low = Math.max(MIN_ACCOUNT_AGE, viewerAge - 3);
    const high = viewerAge + 3;
    return partnerAge >= low && partnerAge <= high;
  }

  if (viewerMinor && !partnerMinor) {
    return partnerVerifiedProfessional;
  }

  if (!viewerMinor && partnerMinor) {
    return viewerVerifiedProfessional;
  }

  return true;
}

export function mutualInteractionAllowed(
  ageA: number,
  ageB: number,
  verifiedProfessionalA = false,
  verifiedProfessionalB = false,
): boolean {
  return (
    allowsPartnerAge(ageA, ageB, verifiedProfessionalA, verifiedProfessionalB) &&
    allowsPartnerAge(ageB, ageA, verifiedProfessionalB, verifiedProfessionalA)
  );
}
