import { getDB, saveDB } from '../database';
import { NotificationRule, NotificationChannel, NotificationLevel } from '../models';
import { generateId, now } from '../utils/common';
import { AppError } from '../middleware/errorHandler';
import { getCustomerOrThrow } from './customerService';

export interface CreateNotificationRuleDTO {
  customerId: string;
  channel: NotificationChannel;
  level: NotificationLevel;
  enabled?: boolean;
  webhookUrl?: string;
  phoneNumbers?: string[];
}

export interface UpdateNotificationRuleDTO {
  enabled?: boolean;
  level?: NotificationLevel;
  webhookUrl?: string;
  phoneNumbers?: string[];
}

export async function listNotificationRules(customerId: string): Promise<NotificationRule[]> {
  const db = getDB();
  return db.data.notificationRules.filter((r) => r.customerId === customerId);
}

export async function getNotificationRule(id: string): Promise<NotificationRule | null> {
  const db = getDB();
  const rule = db.data.notificationRules.find((r) => r.id === id);
  return rule || null;
}

export async function getNotificationRuleOrThrow(id: string): Promise<NotificationRule> {
  const rule = await getNotificationRule(id);
  if (!rule) {
    throw new AppError('通知规则不存在', 404);
  }
  return rule;
}

export async function getNotificationRuleOrThrowByCustomer(id: string, customerId: string): Promise<NotificationRule> {
  const rule = await getNotificationRuleOrThrow(id);
  if (rule.customerId !== customerId) {
    throw new AppError('通知规则不存在', 404);
  }
  return rule;
}

export async function createNotificationRule(
  dto: CreateNotificationRuleDTO
): Promise<NotificationRule> {
  await getCustomerOrThrow(dto.customerId);
  const db = getDB();

  const exists = db.data.notificationRules.find(
    (r) => r.customerId === dto.customerId && r.channel === dto.channel && r.level === dto.level
  );
  if (exists) {
    throw new AppError('相同通道和等级的规则已存在', 400);
  }

  if (dto.channel === 'webhook' && !dto.webhookUrl) {
    throw new AppError('Webhook 通道必须提供 webhookUrl', 400);
  }
  if (dto.channel === 'sms' && (!dto.phoneNumbers || dto.phoneNumbers.length === 0)) {
    throw new AppError('短信通道必须提供手机号', 400);
  }

  const rule: NotificationRule = {
    id: generateId(),
    customerId: dto.customerId,
    channel: dto.channel,
    level: dto.level,
    enabled: dto.enabled ?? true,
    webhookUrl: dto.webhookUrl,
    phoneNumbers: dto.phoneNumbers,
    createdAt: now(),
    updatedAt: now(),
  };

  db.data.notificationRules.push(rule);
  await saveDB();
  return rule;
}

export async function updateNotificationRule(
  id: string,
  dto: UpdateNotificationRuleDTO
): Promise<NotificationRule> {
  const rule = await getNotificationRuleOrThrow(id);

  if (dto.webhookUrl !== undefined && rule.channel === 'webhook' && !dto.webhookUrl) {
    throw new AppError('Webhook 通道必须提供 webhookUrl', 400);
  }
  if (
    dto.phoneNumbers !== undefined &&
    rule.channel === 'sms' &&
    dto.phoneNumbers.length === 0
  ) {
    throw new AppError('短信通道必须提供手机号', 400);
  }

  Object.assign(rule, dto, { updatedAt: now() });
  await saveDB();
  return rule;
}

export async function deleteNotificationRule(id: string): Promise<void> {
  const db = getDB();
  const index = db.data.notificationRules.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new AppError('通知规则不存在', 404);
  }
  db.data.notificationRules.splice(index, 1);
  await saveDB();
}

const LEVEL_ORDER: Record<NotificationLevel, number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

export function shouldTrigger(ruleLevel: NotificationLevel, alertLevel: NotificationLevel): boolean {
  return LEVEL_ORDER[alertLevel] >= LEVEL_ORDER[ruleLevel];
}

export async function getActiveRulesForCustomer(
  customerId: string,
  alertLevel: NotificationLevel
): Promise<NotificationRule[]> {
  const db = getDB();
  return db.data.notificationRules.filter(
    (r) => r.customerId === customerId && r.enabled && shouldTrigger(r.level, alertLevel)
  );
}
