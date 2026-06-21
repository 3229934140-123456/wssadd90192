export type NotificationLevel = 'info' | 'warning' | 'critical';

export type WordPackageType = 'exclusive' | 'industry' | 'event';

export type NotificationChannel = 'sms' | 'wechat' | 'dingtalk' | 'webhook';

export type DeliveryStatus = 'pending' | 'delivered' | 'failed';

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
  webhookUrl?: string;
  phoneNumbers?: string[];
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
  level: NotificationLevel;
  score: number;
  deliveryStatus: DeliveryStatus;
  acknowledged: boolean;
  falsePositive: boolean;
  channels: NotificationChannel[];
  deliveryResults: DeliveryResult[];
  acknowledgedAt?: number;
  falsePositiveAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DeliveryResult {
  channel: NotificationChannel;
  status: DeliveryStatus;
  deliveredAt?: number;
  errorMessage?: string;
  messageId?: string;
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
