/**
 * Quest Types - Platform and ActionType constants
 *
 * These are the available platforms and action types for quests.
 * Used by both verification service and admin dashboard.
 */

// Platform Types
export const PLATFORMS = [
  'FARCASTER',
  'TWITTER',
  'APP',
  'GITHUB',
  'LINKEDIN',
  'BASENAME',
  'WEBSITE',
] as const;

export type Platform = (typeof PLATFORMS)[number];

// Action Types grouped by Platform
export const ACTION_TYPES = {
  FARCASTER: ['FC_LINK', 'FC_SHARE', 'FC_FOLLOW', 'FC_POST_HASHTAG'],
  TWITTER: ['X_LINK', 'X_FOLLOW'],
  APP: [
    'APP_NOTIFICATION',
    'APP_DAILY_CHECKIN',
    'APP_BASECARD_MINT',
    'APP_ADD_MINIAPP',
    'APP_REFERRAL',
    'APP_BIO_UPDATE',
    'APP_SKILL_TAG',
    'APP_VOTE',
    'APP_MANUAL',
  ],
  GITHUB: ['GH_LINK'],
  LINKEDIN: ['LI_LINK'],
  BASENAME: ['BASE_LINK_NAME'],
  WEBSITE: ['WEB_LINK'],
} as const;

// Flatten all action types into a union type
export type ActionType =
  | (typeof ACTION_TYPES.FARCASTER)[number]
  | (typeof ACTION_TYPES.TWITTER)[number]
  | (typeof ACTION_TYPES.APP)[number]
  | (typeof ACTION_TYPES.GITHUB)[number]
  | (typeof ACTION_TYPES.LINKEDIN)[number]
  | (typeof ACTION_TYPES.BASENAME)[number]
  | (typeof ACTION_TYPES.WEBSITE)[number];

// Flatten all action types into a single array
export const ALL_ACTION_TYPES = Object.values(
  ACTION_TYPES,
).flat() as ActionType[];

// Frequency Types
export const FREQUENCIES = [
  'ONCE',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'ALWAYS',
] as const;
export type Frequency = (typeof FREQUENCIES)[number];

// Helper to get action types for a specific platform
export function getActionTypesForPlatform(
  platform: Platform,
): readonly string[] {
  return ACTION_TYPES[platform] || [];
}
