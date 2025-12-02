/**
 * Generic API Response
 * spec.md에 정의된 표준 응답 포맷
 */
export interface ApiResponse<T> {
  success: boolean;
  result: T | null;
  error: string | null;
}

/**
 * Create Card API Response
 * POST /v1/cards 엔드포인트의 응답 타입
 */
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

export interface User {
  id: string;
  walletAddress: string;
  totalPoints: number;
  isNewUser: boolean;
  hasMintedCard: boolean;
  profileImage: string | null;
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}

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

export interface Quest {
  id: string;
  title: string;
  description: string | null;
  reward: number;
  actionType: string;
}

export interface VerifyQuestResponse {
  verified: boolean;
  rewarded: number;
  newTotalPoints: number;
}

export interface Collection {
  id: string;
  collectorUserId: string;
  collectedCardId: string;
  createdAt: string;
}

export interface PointLog {
  id: string;
  userId: string;
  amount: number;
  type: 'QUEST_REWARD' | 'MINT_BONUS' | 'REFERRAL' | 'ADMIN_ADJUST';
  referenceId: string | null;
  createdAt: string;
}
