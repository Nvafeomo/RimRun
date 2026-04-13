import { ageInFullYears } from './agePolicy';

/**
 * Default for `profiles.username_searchable`: adults opt in to username discovery by default;
 * minors default to hidden from Add-friends search unless they change it in Privacy settings.
 */
export function defaultUsernameSearchableForDob(dateOfBirthIso: string): boolean {
  const age = ageInFullYears(dateOfBirthIso);
  if (age === null) return true;
  return age >= 18;
}
