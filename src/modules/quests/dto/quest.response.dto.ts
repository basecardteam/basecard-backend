export interface Quest {
  id: string;
  title: string;
  description: string | null;
  reward: number;
  actionType: string;
}
