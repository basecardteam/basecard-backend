/**
 * Farcaster profile from Neynar API
 */
export interface FarcasterProfile {
  fid: number;
  username: string;
  display_name: string;
  pfp_url: string;
}
export interface BasecardListItem {
  id: string;
  userId: string;
  nickname: string | null;
  role: string | null;
  bio: string | null;
  socials: unknown;
  tokenId: number | null;
  imageUri: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Extended response type for single basecard (findOne)
 * Includes user address, FID, and Farcaster profile PFP URL
 */
export interface BasecardDetail extends BasecardListItem {
  address: string;
  fid: number | null;
  farcasterPfpUrl: string | null;
}

/**
 * On-chain BaseCard metadata structure
 */
export interface BaseCardMetadata {
  nickname: string;
  role: string;
  bio: string;
  imageUri: string;
  socials: { key: string; value: string }[];
}
