export type NotificationLevel = 'info' | 'warning' | 'critical';

export type WordPackageType = 'exclusive' | 'industry' | 'event';

export type NotificationChannel = 'sms' | 'wechat' | 'dingtalk' | 'webhook';

export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying';

export type AuditAction = 'create' | 'update' | 'delete';

export type AuditEntityType = 'word' | 'word_package' | 'notification_rule' | 'customer';

export interface Customer {
  id: string;
  name: string;
  contact: string;
  phone?: string;
  email?: string;
  webhookUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Word {
  id: string;
  word: string;
  type: WordPackageType;
  level: NotificationLevel;
  customerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface WordPackage {
  id: string;
  name: string;
  type: WordPackageType;
  customerId: string;
  description?: string;
  wordIds: string[];
  defaultLevel: NotificationLevel;
  createdAt: number;
  updatedAt: number;
}

export interface NotificationRule {
  id: string;
  customerId: string;
  channel: NotificationChannel;
  level: NotificationLevel;
  enabled: boolean;
  sourceFilters?: string[];
  wordPackageTypes?: WordPackageType[];
  minScore?: number;
  maxScore?: number;
  webhookUrl?: string;
  phoneNumbers?: string[];
  retryEnabled?: boolean;
  maxRetryCount?: number;
  retryIntervalMinutes?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Alert {
  id: string;
  customerId: string;
  title: string;
  content: string;
  source: string;
  sourceUrl?: string;
  sourceWeight: number;
  hitWords: string[];
  hitWordPackageTypes: WordPackageType[];
  level: NotificationLevel;
  score: number;
  deliveryStatus: DeliveryStatus;
  acknowledged: boolean;
  falsePositive: boolean;
  channels: NotificationChannel[];
  deliveryResults: DeliveryResult[];
  matchedRuleIds: string[];
  acknowledgedAt?: number;
  falsePositiveAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DeliveryResult {
  channel: NotificationChannel;
  status: DeliveryStatus;
  ruleId?: string;
  deliveredAt?: number;
  errorMessage?: string;
  messageId?: string;
  retryCount: number;
  lastError?: string;
  nextRetryAt?: number;
  firstFailedAt?: number;
  paused?: boolean;
}

export interface MonitorData {
  customerId: string;
  title: string;
  content: string;
  source: string;
  sourceUrl?: string;
  sourceWeight?: number;
  publishTime?: number;
  extra?: Record<string, any>;
}

export interface AuditLog {
  id: string;
  customerId: string;
  entityType: AuditEntityType;
  entityId: string;
  entityName?: string;
  action: AuditAction;
  operator: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  changes?: string[];
  timestamp: number;
  ip?: string;
  userAgent?: string;
}

export interface BatchImportWordItem {
  word: string;
  type: WordPackageType;
  level: NotificationLevel;
  customerId?: string;
  packageName?: string;
  packageType?: WordPackageType;
  packageDefaultLevel?: NotificationLevel;
}

export interface BatchImportResult {
  success: number;
  failed: number;
  skipped: number;
  successItems: Array<{ word: string; id: string; packages?: string[] }>;
  failedItems: Array<{ word: string; reason: string; row?: number }>;
  skippedItems: Array<{ word: string; reason: string; row?: number }>;
}
