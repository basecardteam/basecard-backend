export interface Card {
  id: string;
  userId: string; // Owner User ID
  tokenId: number | null;
  nickname: string | null;
  role: string | null;
  bio: string | null;
  imageUri: string | null; // NFT Metadata URI (IPFS)
  socials: Record<string, string> | null;
  skills: string[]; // Not in DB but in spec
  address: string; // Mapped from user.walletAddress in GET /cards
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}

export interface CreateCardResponse {
  profile_image: string;
  card_data: {
    nickname: string;
    role: string;
    bio: string;
    imageUri: string;
  };
  social_keys: string[];
  social_values: string[];
}
