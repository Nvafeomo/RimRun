/**
 * RimRun basketball-themed color palette
 * Inspired by courts, orange rims, and sporty energy
 */
export const colors = {
  // Primary - basketball orange
  primary: '#E85D04',
  primaryDark: '#D35400',
  primaryLight: '#FF8C42',

  // Court & background
  background: '#0F1419',
  surface: '#1A1F26',
  surfaceElevated: '#242B33',

  // Text
  text: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  // Borders & inputs
  border: '#334155',
  borderFocus: '#E85D04',
  inputBg: '#1A1F26',

  // Feedback
  error: '#EF4444',
  success: '#22C55E',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;
