export interface UserProfile {
  id: string;
  email?: string;
  name?: string;
  telegramId?: string;
  tier?: string;
  createdAt: string;
  lastLogin: string;
}

export interface UserContext {
  [key: string]: unknown;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  taskType?: string;
  model?: string;
  source?: string;
  durationMs?: number;
  success?: boolean;
  toolCalls?: number;
  toolNames?: string[];
  totalTokens?: number;
  totalCost?: number;
}