import { getDB, saveDB } from '../database';
import { NotificationRule, NotificationChannel, NotificationLevel, WordPackageType } from '../models';
import { generateId, now } from '../utils/common';
import { AppError } from '../middleware/errorHandler';
import { getCustomerOrThrow } from './customerService';
import { createAuditLog, diffObject } from './auditService';

export interface CreateNotificationRuleDTO {
  customerId: string;
  channel: NotificationChannel;
  level: NotificationLevel;
  enabled?: boolean;
  sourceFilters?: string[];
  wordPackageTypes?: WordPackageType[];
  minScore?: number;
  maxScore?: number;
  webhookUrl?: string;
  phoneNumbers?: string[];
  retryEnabled?: boolean;
  maxRetryCount?: number;
  retryIntervalMinutes?: number;
}

export interface UpdateNotificationRuleDTO {
  enabled?: boolean;
  level?: NotificationLevel;
  sourceFilters?: string[];
  wordPackageTypes?: WordPackageType[];
  minScore?: number;
  maxScore?: number;
  webhookUrl?: string;
  phoneNumbers?: string[];
  retryEnabled?: boolean;
  maxRetryCount?: number;
  retryIntervalMinutes?: number;
}

export interface RuleMatchContext {
  level: NotificationLevel;
  source: string;
  score: number;
  hitWordPackageTypes: WordPackageType[];
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
  dto: CreateNotificationRuleDTO,
  operator: string = 'system',
  ip?: string
): Promise<NotificationRule> {
  await getCustomerOrThrow(dto.customerId);
  const db = getDB();

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
    sourceFilters: dto.sourceFilters,
    wordPackageTypes: dto.wordPackageTypes,
    minScore: dto.minScore,
    maxScore: dto.maxScore,
    webhookUrl: dto.webhookUrl,
    phoneNumbers: dto.phoneNumbers,
    retryEnabled: dto.retryEnabled ?? true,
    maxRetryCount: dto.maxRetryCount ?? 3,
    retryIntervalMinutes: dto.retryIntervalMinutes ?? 5,
    createdAt: now(),
    updatedAt: now(),
  };

  db.data.notificationRules.push(rule);
  await saveDB();

  await createAuditLog({
    customerId: dto.customerId,
    entityType: 'notification_rule',
    entityId: rule.id,
    entityName: `${rule.channel}-${rule.level}`,
    action: 'create',
    operator,
    after: { ...rule },
    ip,
  });

  return rule;
}

export async function updateNotificationRule(
  id: string,
  dto: UpdateNotificationRuleDTO,
  operator: string = 'system',
  ip?: string
): Promise<NotificationRule> {
  const rule = await getNotificationRuleOrThrow(id);
  const before = { ...rule };

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

  const changes = diffObject(before, { ...rule });

  await createAuditLog({
    customerId: rule.customerId,
    entityType: 'notification_rule',
    entityId: rule.id,
    entityName: `${rule.channel}-${rule.level}`,
    action: 'update',
    operator,
    before,
    after: { ...rule },
    changes,
    ip,
  });

  return rule;
}

export async function deleteNotificationRule(
  id: string,
  operator: string = 'system',
  ip?: string
): Promise<void> {
  const db = getDB();
  const rule = await getNotificationRuleOrThrow(id);
  const before = { ...rule };

  const index = db.data.notificationRules.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new AppError('通知规则不存在', 404);
  }
  db.data.notificationRules.splice(index, 1);
  await saveDB();

  await createAuditLog({
    customerId: rule.customerId,
    entityType: 'notification_rule',
    entityId: rule.id,
    entityName: `${rule.channel}-${rule.level}`,
    action: 'delete',
    operator,
    before,
    ip,
  });
}

const LEVEL_ORDER: Record<NotificationLevel, number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

export function shouldTriggerByLevel(ruleLevel: NotificationLevel, alertLevel: NotificationLevel): boolean {
  return LEVEL_ORDER[alertLevel] >= LEVEL_ORDER[ruleLevel];
}

export function matchesRule(rule: NotificationRule, ctx: RuleMatchContext): boolean {
  if (!rule.enabled) return false;

  if (!shouldTriggerByLevel(rule.level, ctx.level)) {
    return false;
  }

  if (rule.sourceFilters && rule.sourceFilters.length > 0) {
    if (!rule.sourceFilters.includes(ctx.source)) {
      return false;
    }
  }

  if (rule.wordPackageTypes && rule.wordPackageTypes.length > 0) {
    const hasMatchingType = ctx.hitWordPackageTypes.some((t) => rule.wordPackageTypes!.includes(t));
    if (!hasMatchingType) {
      return false;
    }
  }

  if (rule.minScore !== undefined && ctx.score < rule.minScore) {
    return false;
  }

  if (rule.maxScore !== undefined && ctx.score > rule.maxScore) {
    return false;
  }

  return true;
}

export async function getMatchingRules(
  customerId: string,
  ctx: RuleMatchContext
): Promise<NotificationRule[]> {
  const db = getDB();
  const rules = db.data.notificationRules.filter((r) => r.customerId === customerId);
  return rules.filter((r) => matchesRule(r, ctx));
}
