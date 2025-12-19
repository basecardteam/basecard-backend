export interface PointLog {
  id: string;
  userId: string;
  amount: number;
  type: 'QUEST_REWARD' | 'MINT_BONUS' | 'REFERRAL' | 'ADMIN_ADJUST';
  referenceId: string | null;
  createdAt: string;
}
