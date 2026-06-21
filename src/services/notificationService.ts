import axios from 'axios';
import logger from '../utils/logger';
import { NotificationChannel, Alert, DeliveryResult, NotificationRule } from '../models';
import { getCustomer } from './customerService';
import { now } from '../utils/common';

interface NotificationPayload {
  alert: Alert;
  hitWords: string[];
  level: string;
}

export async function sendNotification(
  channel: NotificationChannel,
  rule: NotificationRule,
  alert: Alert
): Promise<DeliveryResult> {
  const result: DeliveryResult = {
    channel,
    status: 'pending',
    retryCount: 0,
  };

  try {
    switch (channel) {
      case 'sms':
        return await sendSms(rule, alert, result);
      case 'wechat':
        return await sendWechat(rule, alert, result);
      case 'dingtalk':
        return await sendDingtalk(rule, alert, result);
      case 'webhook':
        return await sendWebhook(rule, alert, result);
      default:
        result.status = 'failed';
        result.errorMessage = `不支持的通知通道: ${channel}`;
        return result;
    }
  } catch (err: any) {
    result.status = 'failed';
    result.errorMessage = err.message || '未知错误';
    logger.error(`[Notification] 发送失败 channel=${channel} alertId=${alert.id}`, {
      error: err.message,
    });
    return result;
  }
}

async function sendSms(
  rule: NotificationRule,
  alert: Alert,
  result: DeliveryResult
): Promise<DeliveryResult> {
  const phones = rule.phoneNumbers || [];
  if (phones.length === 0) {
    result.status = 'failed';
    result.errorMessage = '短信通道缺少手机号';
    return result;
  }

  const content = `【舆情告警】${alert.title} - 等级:${alert.level} 命中:${alert.hitWords.join(',')}`;

  logger.info(`[SMS] 模拟发送短信 to=${phones.join(',')} content=${content}`);

  result.status = 'delivered';
  result.deliveredAt = now();
  result.messageId = `sms_${alert.id}_${Date.now()}`;

  return result;
}

async function sendWechat(
  rule: NotificationRule,
  alert: Alert,
  result: DeliveryResult
): Promise<DeliveryResult> {
  const webhookUrl = rule.webhookUrl;
  if (!webhookUrl) {
    result.status = 'failed';
    result.errorMessage = '企业微信缺少 webhook 地址';
    return result;
  }

  const payload = {
    msgtype: 'markdown',
    markdown: {
      content: `## 舆情告警\n\n**标题**: ${alert.title}\n**等级**: <font color=\"${getLevelColor(alert.level)}\">${alert.level}</font>\n**来源**: ${alert.source}\n**命中词**: ${alert.hitWords.join('、')}\n**告警分数**: ${alert.score}\n\n[查看详情](${alert.sourceUrl || '#'})`,
    },
  };

  logger.info(`[WeChat] 模拟发送企业微信 webhook=${webhookUrl}`);
  logger.debug('[WeChat] payload:', payload);

  try {
    const response = await axios.post(webhookUrl, payload, { timeout: 5000 });
    result.status = 'delivered';
    result.deliveredAt = now();
    result.messageId = `wechat_${alert.id}_${Date.now()}`;
    logger.debug(`[WeChat] 发送成功，响应状态: ${response.status}`);
  } catch (err: any) {
    result.status = 'failed';
    result.errorMessage = err.message || '企业微信 webhook 调用失败';
    logger.error(`[WeChat] webhook 调用失败: ${err.message}`);
  }

  return result;
}

async function sendDingtalk(
  rule: NotificationRule,
  alert: Alert,
  result: DeliveryResult
): Promise<DeliveryResult> {
  const webhookUrl = rule.webhookUrl;
  if (!webhookUrl) {
    result.status = 'failed';
    result.errorMessage = '钉钉缺少 webhook 地址';
    return result;
  }

  const payload = {
    msgtype: 'markdown',
    markdown: {
      title: '舆情告警',
      text: `## 舆情告警\n\n**标题**: ${alert.title}\n**等级**: ${alert.level}\n**来源**: ${alert.source}\n**命中词**: ${alert.hitWords.join('、')}\n**告警分数**: ${alert.score}\n\n[查看详情](${alert.sourceUrl || '#'})`,
    },
  };

  logger.info(`[DingTalk] 模拟发送钉钉 webhook=${webhookUrl}`);

  try {
    const response = await axios.post(webhookUrl, payload, { timeout: 5000 });
    result.status = 'delivered';
    result.deliveredAt = now();
    result.messageId = `dingtalk_${alert.id}_${Date.now()}`;
    logger.debug(`[DingTalk] 发送成功，响应状态: ${response.status}`);
  } catch (err: any) {
    result.status = 'failed';
    result.errorMessage = err.message || '钉钉 webhook 调用失败';
    logger.error(`[DingTalk] webhook 调用失败: ${err.message}`);
  }

  return result;
}

async function sendWebhook(
  rule: NotificationRule,
  alert: Alert,
  result: DeliveryResult
): Promise<DeliveryResult> {
  const webhookUrl = rule.webhookUrl;
  if (!webhookUrl) {
    result.status = 'failed';
    result.errorMessage = 'Webhook 缺少地址';
    return result;
  }

  const payload = {
    event: 'alert.created',
    alertId: alert.id,
    customerId: alert.customerId,
    title: alert.title,
    content: alert.content,
    level: alert.level,
    score: alert.score,
    source: alert.source,
    sourceUrl: alert.sourceUrl,
    hitWords: alert.hitWords,
    createdAt: alert.createdAt,
  };

  logger.info(`[Webhook] 发送回调 url=${webhookUrl} alertId=${alert.id}`);

  try {
    const response = await axios.post(webhookUrl, payload, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });
    result.status = 'delivered';
    result.deliveredAt = now();
    result.messageId = `webhook_${alert.id}_${Date.now()}`;
    logger.debug(`[Webhook] 响应状态: ${response.status}`);
  } catch (err: any) {
    result.status = 'failed';
    result.errorMessage = err.message || 'Webhook 调用失败';
    logger.error(`[Webhook] 调用失败: ${err.message}`);
  }

  return result;
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'critical':
      return 'red';
    case 'warning':
      return 'orange';
    case 'info':
      return 'green';
    default:
      return 'gray';
  }
}

export async function sendCustomerDefaultWebhook(
  customerId: string,
  alert: Alert
): Promise<DeliveryResult> {
  const result: DeliveryResult = {
    channel: 'webhook',
    status: 'pending',
    retryCount: 0,
  };

  const customer = await getCustomer(customerId);
  if (!customer || !customer.webhookUrl) {
    result.status = 'failed';
    result.errorMessage = '客户未配置默认 webhook';
    return result;
  }

  const rule: NotificationRule = {
    id: 'default',
    customerId,
    channel: 'webhook',
    level: alert.level,
    enabled: true,
    webhookUrl: customer.webhookUrl,
    createdAt: 0,
    updatedAt: 0,
  };

  return sendWebhook(rule, alert, result);
}
