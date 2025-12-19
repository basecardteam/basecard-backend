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
