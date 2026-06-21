import { getDB, saveDB } from '../database';
import {
  Alert,
  DeliveryStatus,
  MonitorData,
  NotificationLevel,
  Word,
  NotificationChannel,
  DeliveryResult,
  NotificationRule,
  WordPackageType,
} from '../models';
import { generateId, now } from '../utils/common';
import { AppError } from '../middleware/errorHandler';
import { getWordsByCustomer } from './wordService';
import { getMatchingRules, getNotificationRule } from './notificationRuleService';
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

export interface AlertMatchResult {
  hitWords: string[];
  highestLevel: NotificationLevel;
  score: number;
  matchedWords: Word[];
  hitWordPackageTypes: WordPackageType[];
  wordLevels: Record<string, { wordLevel: NotificationLevel; packageLevels: NotificationLevel[]; finalLevel: NotificationLevel }>;
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
): Promise<{
  highestLevel: NotificationLevel;
  hitWordPackageTypes: WordPackageType[];
  wordLevels: AlertMatchResult['wordLevels'];
}> {
  const wordLevels: AlertMatchResult['wordLevels'] = {};
  const packageTypeSet = new Set<WordPackageType>();
  let highestLevel: NotificationLevel = 'info';

  for (const word of matchedWords) {
    const packages = await getWordPackagesContainingWord(customerId, word.id);
    const packageLevels: NotificationLevel[] = packages.map((p) => p.defaultLevel);

    let finalLevel: NotificationLevel = word.level;
    if (packages.length > 0) {
      let maxPackageLevel: NotificationLevel = 'info';
      for (const p of packages) {
        if (LEVEL_ORDER[p.defaultLevel] > LEVEL_ORDER[maxPackageLevel]) {
          maxPackageLevel = p.defaultLevel;
        }
        packageTypeSet.add(p.type);
      }
      finalLevel = maxPackageLevel;
    }

    wordLevels[word.word] = {
      wordLevel: word.level,
      packageLevels,
      finalLevel,
    };

    if (LEVEL_ORDER[finalLevel] > LEVEL_ORDER[highestLevel]) {
      highestLevel = finalLevel;
    }
  }

  return {
    highestLevel,
    hitWordPackageTypes: Array.from(packageTypeSet),
    wordLevels,
  };
}

export function calculateFinalScore(baseScore: number, sourceWeight: number): number {
  const weight = sourceWeight || config.defaultSourceWeight;
  return Math.round(baseScore * weight);
}

function createInitialDeliveryResult(
  rule: NotificationRule
): DeliveryResult {
  return {
    channel: rule.channel,
    status: 'pending',
    ruleId: rule.id,
    retryCount: 0,
  };
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

  const { highestLevel, hitWordPackageTypes, wordLevels } = await calculateAlertLevelWithPackages(
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

  const matchingRules = await getMatchingRules(data.customerId, {
    level: highestLevel,
    source: data.source,
    score: finalScore,
    hitWordPackageTypes,
  });

  logger.info(`[Alert] 匹配到 ${matchingRules.length} 条通知规则`);

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
    hitWordPackageTypes,
    level: highestLevel,
    score: finalScore,
    deliveryStatus: 'pending',
    acknowledged: false,
    falsePositive: false,
    channels: [],
    deliveryResults: matchingRules.map(createInitialDeliveryResult),
    matchedRuleIds: matchingRules.map((r) => r.id),
    createdAt: now(),
    updatedAt: now(),
  };

  db.data.alerts.push(alert);
  await saveDB();

  await distributeAlert(alert, matchingRules);

  return alert;
}

async function distributeAlert(alert: Alert, rules: NotificationRule[]): Promise<void> {
  logger.info(`[Alert] 开始分发告警 alertId=${alert.id} rules=${rules.length}`);

  const channels: NotificationChannel[] = [];
  const results: DeliveryResult[] = [];

  for (const rule of rules) {
    if (!channels.includes(rule.channel)) {
      channels.push(rule.channel);
    }

    const result = await sendNotification(rule.channel, rule, alert);
    result.ruleId = rule.id;
    result.retryCount = 0;

    if (result.status === 'failed' && rule.retryEnabled !== false) {
      result.firstFailedAt = now();
      result.lastError = result.errorMessage;
      const retryInterval = (rule.retryIntervalMinutes || 5) * 60 * 1000;
      result.nextRetryAt = now() + retryInterval;
      result.status = 'retrying';
    }

    results.push(result);
  }

  if (rules.length === 0) {
    logger.warn(`[Alert] 没有匹配的通知规则，尝试使用客户默认 webhook`);
    const defaultResult = await sendCustomerDefaultWebhook(alert.customerId, alert);
    if (defaultResult.status === 'delivered') {
      channels.push('webhook');
    }
    defaultResult.retryCount = 0;
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
  const hasRetrying = results.some((r) => r.status === 'retrying');
  const allFailed = results.every((r) => r.status === 'failed');

  if (hasDelivered) return 'delivered';
  if (hasRetrying) return 'retrying';
  if (allFailed) return 'failed';
  return 'pending';
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
  matchedRuleIds: string[];
  matchedRules: Array<{
    id: string;
    channel: NotificationChannel;
    level: NotificationLevel;
    sourceFilters?: string[];
    wordPackageTypes?: WordPackageType[];
    minScore?: number;
    maxScore?: number;
  }>;
  deliveries: Array<DeliveryResult & {
    ruleInfo?: {
      channel: NotificationChannel;
      level: NotificationLevel;
      sourceFilters?: string[];
      wordPackageTypes?: WordPackageType[];
      minScore?: number;
      maxScore?: number;
    };
  }>;
}> {
  const alert = await getAlertOrThrow(id);
  const db = getDB();

  const matchedRules = alert.matchedRuleIds
    .map((ruleId) => db.data.notificationRules.find((r) => r.id === ruleId))
    .filter((r): r is NotificationRule => r !== undefined)
    .map((r) => ({
      id: r.id,
      channel: r.channel,
      level: r.level,
      sourceFilters: r.sourceFilters,
      wordPackageTypes: r.wordPackageTypes,
      minScore: r.minScore,
      maxScore: r.maxScore,
    }));

  const deliveries = alert.deliveryResults.map((d) => {
    const ruleInfo = d.ruleId
      ? db.data.notificationRules.find((r) => r.id === d.ruleId)
      : undefined;
    return {
      ...d,
      ruleInfo: ruleInfo ? {
        channel: ruleInfo.channel,
        level: ruleInfo.level,
        sourceFilters: ruleInfo.sourceFilters,
        wordPackageTypes: ruleInfo.wordPackageTypes,
        minScore: ruleInfo.minScore,
        maxScore: ruleInfo.maxScore,
      } : undefined,
    };
  });

  return {
    alertId: alert.id,
    deliveryStatus: alert.deliveryStatus,
    acknowledged: alert.acknowledged,
    acknowledgedAt: alert.acknowledgedAt,
    falsePositive: alert.falsePositive,
    falsePositiveAt: alert.falsePositiveAt,
    matchedRuleIds: alert.matchedRuleIds,
    matchedRules,
    deliveries,
  };
}

export async function retryAlertChannel(
  alertId: string,
  channel: NotificationChannel,
  customerId: string,
  ruleId?: string
): Promise<DeliveryResult> {
  const alert = await getAlertOrThrowByCustomer(alertId, customerId);
  const db = getDB();

  let deliveryIdx: number;
  if (ruleId) {
    deliveryIdx = alert.deliveryResults.findIndex((d) => d.channel === channel && d.ruleId === ruleId);
  } else {
    deliveryIdx = alert.deliveryResults.findIndex((d) => d.channel === channel);
  }
  
  if (deliveryIdx === -1) {
    throw new AppError(`该告警没有 ${channel} 通道${ruleId ? '（规则:' + ruleId + '）' : ''}的投递记录`, 400);
  }

  const delivery = alert.deliveryResults[deliveryIdx];
  const rule = delivery.ruleId ? await getNotificationRule(delivery.ruleId) : null;

  if (!rule) {
    throw new AppError('对应的通知规则不存在', 400);
  }

  logger.info(`[Alert] 手动重发告警 alertId=${alertId} channel=${channel} ruleId=${ruleId || 'default'}`);

  const result = await sendNotification(channel, rule, alert);
  result.ruleId = rule.id;
  result.retryCount = (delivery.retryCount || 0) + 1;
  result.lastError = result.errorMessage;
  result.paused = delivery.paused;

  if (result.status === 'failed' && rule.retryEnabled !== false) {
    if (!delivery.firstFailedAt) {
      result.firstFailedAt = now();
    } else {
      result.firstFailedAt = delivery.firstFailedAt;
    }
    const maxRetry = rule.maxRetryCount || 3;
    if (result.retryCount < maxRetry) {
      const retryInterval = (rule.retryIntervalMinutes || 5) * 60 * 1000;
      result.nextRetryAt = now() + retryInterval;
      result.status = 'retrying';
    }
  }

  alert.deliveryResults[deliveryIdx] = result;
  alert.deliveryStatus = calculateOverallDeliveryStatus(alert.deliveryResults);
  alert.updatedAt = now();

  await saveDB();
  return result;
}

export async function getRetryableAlerts(
  customerId?: string
): Promise<Array<{ alert: Alert; delivery: DeliveryResult; rule: NotificationRule | null }>> {
  const db = getDB();
  const currentTs = now();
  const retryable: Array<{ alert: Alert; delivery: DeliveryResult; rule: NotificationRule | null }> = [];

  for (const alert of db.data.alerts) {
    if (customerId && alert.customerId !== customerId) continue;
    
    for (const delivery of alert.deliveryResults) {
      if (
        delivery.status === 'retrying' &&
        !delivery.paused &&
        delivery.nextRetryAt &&
        delivery.nextRetryAt <= currentTs
      ) {
        const rule = delivery.ruleId
          ? db.data.notificationRules.find((r) => r.id === delivery.ruleId) || null
          : null;
        retryable.push({ alert, delivery, rule });
      }
    }
  }

  return retryable;
}

export async function processRetryQueue(): Promise<number> {
  logger.info('[Alert] 开始处理重试队列');
  const retryable = await getRetryableAlerts();
  let processed = 0;

  for (const item of retryable) {
    try {
      if (!item.rule) continue;

      const result = await sendNotification(item.delivery.channel, item.rule, item.alert);
      result.ruleId = item.delivery.ruleId;
      result.retryCount = (item.delivery.retryCount || 0) + 1;
      result.lastError = result.errorMessage;
      result.firstFailedAt = item.delivery.firstFailedAt;

      if (result.status === 'failed') {
        const maxRetry = item.rule.maxRetryCount || 3;
        if (result.retryCount < maxRetry) {
          const retryInterval = (item.rule.retryIntervalMinutes || 5) * 60 * 1000;
          result.nextRetryAt = now() + retryInterval;
          result.status = 'retrying';
        }
      }

      const db = getDB();
      const alertInDB = db.data.alerts.find((a) => a.id === item.alert.id);
      if (alertInDB) {
        const idx = alertInDB.deliveryResults.findIndex(
          (d) => d.channel === item.delivery.channel
        );
        if (idx !== -1) {
          alertInDB.deliveryResults[idx] = result;
          alertInDB.deliveryStatus = calculateOverallDeliveryStatus(alertInDB.deliveryResults);
          alertInDB.updatedAt = now();
        }
      }

      await saveDB();
      processed++;
      logger.info(
        `[Alert] 重试完成 alertId=${item.alert.id} channel=${item.delivery.channel} status=${result.status}`
      );
    } catch (err: any) {
      logger.error(`[Alert] 重试失败 alertId=${item.alert.id}`, { error: err.message });
    }
  }

  logger.info(`[Alert] 重试队列处理完成，共处理 ${processed} 条`);
  return processed;
}

export interface RetryQueueItem {
  alertId: string;
  alertTitle: string;
  channel: NotificationChannel;
  ruleId: string;
  ruleChannel: NotificationChannel;
  ruleLevel: NotificationLevel;
  ruleSourceFilters?: string[];
  ruleWordPackageTypes?: WordPackageType[];
  ruleMinScore?: number;
  ruleMaxScore?: number;
  retryCount: number;
  lastError?: string;
  nextRetryAt?: number;
  firstFailedAt?: number;
  paused?: boolean;
}

export async function listRetryQueue(customerId: string): Promise<RetryQueueItem[]> {
  const db = getDB();
  const items: RetryQueueItem[] = [];

  for (const alert of db.data.alerts) {
    if (alert.customerId !== customerId) continue;

    for (const delivery of alert.deliveryResults) {
      if (delivery.status === 'retrying' && delivery.ruleId) {
        const rule = db.data.notificationRules.find((r) => r.id === delivery.ruleId);
        if (rule) {
          items.push({
            alertId: alert.id,
            alertTitle: alert.title,
            channel: delivery.channel,
            ruleId: rule.id,
            ruleChannel: rule.channel,
            ruleLevel: rule.level,
            ruleSourceFilters: rule.sourceFilters,
            ruleWordPackageTypes: rule.wordPackageTypes,
            ruleMinScore: rule.minScore,
            ruleMaxScore: rule.maxScore,
            retryCount: delivery.retryCount,
            lastError: delivery.lastError,
            nextRetryAt: delivery.nextRetryAt,
            firstFailedAt: delivery.firstFailedAt,
            paused: delivery.paused,
          });
        }
      }
    }
  }

  items.sort((a, b) => (a.nextRetryAt || 0) - (b.nextRetryAt || 0));
  return items;
}

export async function updateRetryPauseStatus(
  customerId: string,
  items: Array<{ alertId: string; ruleId: string; paused: boolean }>
): Promise<{ updated: number }> {
  const db = getDB();
  let updated = 0;

  for (const item of items) {
    const alert = db.data.alerts.find((a) => a.id === item.alertId && a.customerId === customerId);
    if (!alert) continue;

    const deliveryIdx = alert.deliveryResults.findIndex(
      (d) => d.ruleId === item.ruleId
    );

    if (deliveryIdx !== -1) {
      alert.deliveryResults[deliveryIdx].paused = item.paused;
      alert.updatedAt = now();
      updated++;
    }
  }

  if (updated > 0) {
    await saveDB();
  }

  return { updated };
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
    retrying: 0,
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
