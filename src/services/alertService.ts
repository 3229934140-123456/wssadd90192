import { getDB, saveDB } from '../database';
import {
  Alert,
  DeliveryStatus,
  MonitorData,
  NotificationLevel,
  Word,
  NotificationChannel,
  DeliveryResult,
} from '../models';
import { generateId, now } from '../utils/common';
import { AppError } from '../middleware/errorHandler';
import { getWordsByCustomer } from './wordService';
import { getActiveRulesForCustomer } from './notificationRuleService';
import { sendNotification, sendCustomerDefaultWebhook } from './notificationService';
import { getWordPackagesContainingWord } from './wordPackageService';
import { config } from '../config';
import logger from '../utils/logger';

const LEVEL_ORDER: Record<NotificationLevel, number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

function getHigherLevel(a: NotificationLevel, b: NotificationLevel): NotificationLevel {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b;
}

export interface AlertQueryParams {
  customerId: string;
  deliveryStatus?: DeliveryStatus;
  acknowledged?: boolean;
  falsePositive?: boolean;
  level?: NotificationLevel;
  source?: string;
  startTime?: number;
  endTime?: number;
  page?: number;
  pageSize?: number;
}

export interface AlertMatchResult {
  hitWords: string[];
  highestLevel: NotificationLevel;
  score: number;
  matchedWords: Word[];
  wordLevels: Record<string, { wordLevel: NotificationLevel; packageLevel: NotificationLevel | null; finalLevel: NotificationLevel }>;
}

export function matchSensitiveWords(content: string, words: Word[]): { matchedWords: Word[]; hitWordStrings: string[] } {
  const lowerContent = content.toLowerCase();
  const matchedWords: Word[] = [];
  const hitWordStrings: string[] = [];

  for (const word of words) {
    if (lowerContent.includes(word.word.toLowerCase())) {
      matchedWords.push(word);
      if (!hitWordStrings.includes(word.word)) {
        hitWordStrings.push(word.word);
      }
    }
  }

  return { matchedWords, hitWordStrings };
}

export async function calculateAlertLevelWithPackages(
  customerId: string,
  matchedWords: Word[]
): Promise<{ highestLevel: NotificationLevel; wordLevels: AlertMatchResult['wordLevels'] }> {
  const wordLevels: AlertMatchResult['wordLevels'] = {};
  let highestLevel: NotificationLevel = 'info';

  for (const word of matchedWords) {
    const packages = await getWordPackagesContainingWord(customerId, word.id);
    
    let packageLevel: NotificationLevel | null = null;
    for (const wp of packages) {
      if (packageLevel === null || LEVEL_ORDER[wp.defaultLevel] > LEVEL_ORDER[packageLevel]) {
        packageLevel = wp.defaultLevel;
      }
    }

    const finalLevel = packageLevel !== null 
      ? getHigherLevel(word.level, packageLevel)
      : word.level;

    wordLevels[word.word] = {
      wordLevel: word.level,
      packageLevel,
      finalLevel,
    };

    if (LEVEL_ORDER[finalLevel] > LEVEL_ORDER[highestLevel]) {
      highestLevel = finalLevel;
    }
  }

  return { highestLevel, wordLevels };
}

export function calculateFinalScore(baseScore: number, sourceWeight: number): number {
  const weight = sourceWeight || config.defaultSourceWeight;
  return Math.round(baseScore * weight);
}

export async function processMonitorData(data: MonitorData): Promise<Alert | null> {
  logger.info(`[Alert] 处理监测数据 customerId=${data.customerId} title=${data.title}`);

  const words = await getWordsByCustomer(data.customerId);
  if (words.length === 0) {
    logger.warn(`[Alert] 客户 ${data.customerId} 没有配置任何敏感词，跳过`);
    return null;
  }

  const fullContent = `${data.title}\n${data.content}`;
  const { matchedWords, hitWordStrings } = matchSensitiveWords(fullContent, words);

  if (matchedWords.length === 0) {
    logger.info('[Alert] 未命中任何敏感词，跳过');
    return null;
  }

  const { highestLevel, wordLevels } = await calculateAlertLevelWithPackages(
    data.customerId,
    matchedWords
  );

  logger.info(
    `[Alert] 命中 ${hitWordStrings.length} 个敏感词，最高等级: ${highestLevel}`
  );
  logger.debug('[Alert] 词等级详情:', wordLevels);

  const baseScore = hitWordStrings.length * 10;
  const levelBonus = LEVEL_ORDER[highestLevel] * 20;
  const baseScoreTotal = baseScore + levelBonus;
  const sourceWeight = data.sourceWeight ?? config.defaultSourceWeight;
  const finalScore = calculateFinalScore(baseScoreTotal, sourceWeight);

  const db = getDB();
  const alert: Alert = {
    id: generateId(),
    customerId: data.customerId,
    title: data.title,
    content: data.content,
    source: data.source,
    sourceUrl: data.sourceUrl,
    sourceWeight,
    hitWords: hitWordStrings,
    level: highestLevel,
    score: finalScore,
    deliveryStatus: 'pending',
    acknowledged: false,
    falsePositive: false,
    channels: [],
    deliveryResults: [],
    createdAt: now(),
    updatedAt: now(),
  };

  db.data.alerts.push(alert);
  await saveDB();

  await distributeAlert(alert);

  return alert;
}

async function distributeAlert(alert: Alert): Promise<void> {
  logger.info(`[Alert] 开始分发告警 alertId=${alert.id}`);

  const rules = await getActiveRulesForCustomer(alert.customerId, alert.level);
  const channels: NotificationChannel[] = [];
  const results: DeliveryResult[] = [];

  for (const rule of rules) {
    if (!channels.includes(rule.channel)) {
      channels.push(rule.channel);
    }

    const result = await sendNotification(rule.channel, rule, alert);
    results.push(result);
  }

  if (rules.length === 0) {
    logger.warn(`[Alert] 没有匹配的通知规则，尝试使用客户默认 webhook`);
    const defaultResult = await sendCustomerDefaultWebhook(alert.customerId, alert);
    if (defaultResult.status === 'delivered') {
      channels.push('webhook');
    }
    results.push(defaultResult);
  }

  const db = getDB();
  const alertInDB = db.data.alerts.find((a) => a.id === alert.id);
  if (alertInDB) {
    alertInDB.channels = channels;
    alertInDB.deliveryResults = results;
    alertInDB.deliveryStatus = calculateOverallDeliveryStatus(results);
    alertInDB.updatedAt = now();
    await saveDB();
  }

  logger.info(
    `[Alert] 告警分发完成 alertId=${alert.id} deliveryStatus=${alertInDB?.deliveryStatus} channels=${channels.join(',')}`
  );
}

function calculateOverallDeliveryStatus(results: DeliveryResult[]): DeliveryStatus {
  if (results.length === 0) return 'pending';

  const hasDelivered = results.some((r) => r.status === 'delivered');
  const allFailed = results.every((r) => r.status === 'failed');

  if (hasDelivered) return 'delivered';
  if (allFailed) return 'failed';
  return 'pending';
}

export async function listAlerts(params: AlertQueryParams): Promise<{ list: Alert[]; total: number }> {
  const db = getDB();
  let alerts = db.data.alerts.filter((a) => a.customerId === params.customerId);

  if (params.deliveryStatus) {
    alerts = alerts.filter((a) => a.deliveryStatus === params.deliveryStatus);
  }
  if (params.acknowledged !== undefined) {
    alerts = alerts.filter((a) => a.acknowledged === params.acknowledged);
  }
  if (params.falsePositive !== undefined) {
    alerts = alerts.filter((a) => a.falsePositive === params.falsePositive);
  }
  if (params.level) {
    alerts = alerts.filter((a) => a.level === params.level);
  }
  if (params.source) {
    alerts = alerts.filter((a) => a.source === params.source);
  }
  if (params.startTime) {
    alerts = alerts.filter((a) => a.createdAt >= params.startTime!);
  }
  if (params.endTime) {
    alerts = alerts.filter((a) => a.createdAt <= params.endTime!);
  }

  alerts.sort((a, b) => b.createdAt - a.createdAt);

  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const start = (page - 1) * pageSize;

  return {
    list: alerts.slice(start, start + pageSize),
    total: alerts.length,
  };
}

export async function getAlert(id: string): Promise<Alert | null> {
  const db = getDB();
  const alert = db.data.alerts.find((a) => a.id === id);
  return alert || null;
}

export async function getAlertOrThrow(id: string): Promise<Alert> {
  const alert = await getAlert(id);
  if (!alert) {
    throw new AppError('告警不存在', 404);
  }
  return alert;
}

export async function getAlertOrThrowByCustomer(id: string, customerId: string): Promise<Alert> {
  const alert = await getAlertOrThrow(id);
  if (alert.customerId !== customerId) {
    throw new AppError('告警不存在', 404);
  }
  return alert;
}

export async function acknowledgeAlert(id: string): Promise<Alert> {
  await getAlertOrThrow(id);
  const db = getDB();

  const alertInDB = db.data.alerts.find((a) => a.id === id)!;
  alertInDB.acknowledged = true;
  alertInDB.acknowledgedAt = now();
  alertInDB.updatedAt = now();

  await saveDB();
  logger.info(`[Alert] 告警已确认 alertId=${id}`);

  return alertInDB;
}

export async function markFalsePositive(id: string): Promise<Alert> {
  await getAlertOrThrow(id);
  const db = getDB();

  const alertInDB = db.data.alerts.find((a) => a.id === id)!;
  alertInDB.falsePositive = true;
  alertInDB.falsePositiveAt = now();
  alertInDB.updatedAt = now();

  await saveDB();
  logger.info(`[Alert] 告警标记为误报 alertId=${id}`);

  return alertInDB;
}

export async function getAlertDeliveryStatus(id: string): Promise<{
  alertId: string;
  deliveryStatus: DeliveryStatus;
  acknowledged: boolean;
  acknowledgedAt?: number;
  falsePositive: boolean;
  falsePositiveAt?: number;
  deliveries: DeliveryResult[];
}> {
  const alert = await getAlertOrThrow(id);

  return {
    alertId: alert.id,
    deliveryStatus: alert.deliveryStatus,
    acknowledged: alert.acknowledged,
    acknowledgedAt: alert.acknowledgedAt,
    falsePositive: alert.falsePositive,
    falsePositiveAt: alert.falsePositiveAt,
    deliveries: alert.deliveryResults,
  };
}

export async function getAlertStatistics(customerId: string, days: number = 7): Promise<{
  total: number;
  byLevel: Record<NotificationLevel, number>;
  byDeliveryStatus: Record<DeliveryStatus, number>;
  byAcknowledged: { acknowledged: number; unacknowledged: number };
  byFalsePositive: { falsePositive: number; valid: number };
  bySource: Record<string, number>;
  trend: Array<{ date: string; count: number }>;
}> {
  const db = getDB();
  const startTime = now() - days * 24 * 60 * 60 * 1000;

  const alerts = db.data.alerts.filter(
    (a) => a.customerId === customerId && a.createdAt >= startTime
  );

  const byLevel: Record<NotificationLevel, number> = {
    info: 0,
    warning: 0,
    critical: 0,
  };
  const byDeliveryStatus: Record<DeliveryStatus, number> = {
    pending: 0,
    delivered: 0,
    failed: 0,
  };
  const byAcknowledged = { acknowledged: 0, unacknowledged: 0 };
  const byFalsePositive = { falsePositive: 0, valid: 0 };
  const bySource: Record<string, number> = {};

  const trendMap: Record<string, number> = {};

  for (const alert of alerts) {
    byLevel[alert.level]++;
    byDeliveryStatus[alert.deliveryStatus]++;
    if (alert.acknowledged) {
      byAcknowledged.acknowledged++;
    } else {
      byAcknowledged.unacknowledged++;
    }
    if (alert.falsePositive) {
      byFalsePositive.falsePositive++;
    } else {
      byFalsePositive.valid++;
    }
    bySource[alert.source] = (bySource[alert.source] || 0) + 1;

    const date = new Date(alert.createdAt).toISOString().split('T')[0];
    trendMap[date] = (trendMap[date] || 0) + 1;
  }

  const trend = Object.entries(trendMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return {
    total: alerts.length,
    byLevel,
    byDeliveryStatus,
    byAcknowledged,
    byFalsePositive,
    bySource,
    trend,
  };
}
