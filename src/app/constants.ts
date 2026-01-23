/**
 * Known Farcaster client FIDs
 * METAMASK uses 0 as placeholder (no FID)
 */
export const CLIENT_FIDS = {
  METAMASK: 0,
  FARCASTER: 9152,
  BASEAPP: 309857,
} as const;

export type ClientFid = (typeof CLIENT_FIDS)[keyof typeof CLIENT_FIDS];

/**
 * Get client type name from FID (matches DB schema)
 */
export function getClientTypeFromFid(
  fid: number,
): 'farcaster' | 'baseapp' | 'metamask' {
  switch (fid) {
    case CLIENT_FIDS.METAMASK:
      return 'metamask';
    case CLIENT_FIDS.BASEAPP:
      return 'baseapp';
    case CLIENT_FIDS.FARCASTER:
      return 'farcaster';
    default:
      return 'farcaster'; // warpcast and other farcaster clients
  }
}
