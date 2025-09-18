import { MODELS } from "@/lib/utils";

export type UserTier = "free" | "paid" | "admin";

export interface TierPermissions {
  hasVoiceAccess: boolean;
  hasRealtimeAccess: boolean;
  models: string[];
}

export interface UserProfile {
  id: string;
  email?: string;
  telegramId?: number;
  telegramChatId?: number;
  name: string;
  tier: UserTier;
  createdAt: Date;
  lastLogin: Date;
}

export const TIER_PERMISSIONS: Record<UserTier, TierPermissions> = {
  free: {
    hasVoiceAccess: false,
    hasRealtimeAccess: false,
    models: [MODELS.textBudget],
  },
  paid: {
    hasVoiceAccess: true,
    hasRealtimeAccess: true,
    models: [MODELS.text, MODELS.textBudget, MODELS.realtime],
  },
  admin: {
    hasVoiceAccess: true,
    hasRealtimeAccess: true,
    models: [MODELS.text, MODELS.textBudget, MODELS.realtime],
  },
};
