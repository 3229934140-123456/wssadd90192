import { Router, Request, Response } from 'express';
import * as notificationRuleService from '../services/notificationRuleService';

const router = Router();

router.get('/:customerId/notification-rules', async (req: Request, res: Response, next) => {
  try {
    const { customerId } = req.params;
    const result = await notificationRuleService.listNotificationRules(customerId);
    res.success(result, '获取通知规则列表成功');
  } catch (err) {
    next(err);
  }
});

router.get('/:customerId/notification-rules/:id', async (req: Request, res: Response, next) => {
  try {
    const rule = await notificationRuleService.getNotificationRuleOrThrowByCustomer(
      req.params.id,
      req.params.customerId
    );
    res.success(rule, '获取通知规则成功');
  } catch (err) {
    next(err);
  }
});

router.post('/:customerId/notification-rules', async (req: Request, res: Response, next) => {
  try {
    const { customerId } = req.params;
    const {
      channel,
      level,
      enabled,
      sourceFilters,
      wordPackageTypes,
      minScore,
      maxScore,
      webhookUrl,
      phoneNumbers,
      retryEnabled,
      maxRetryCount,
      retryIntervalMinutes,
    } = req.body;

    if (!channel || !level) {
      return res.fail('通知通道和等级不能为空');
    }

    const operator = (req.headers['x-operator'] as string) || 'system';
    const ip = req.ip;

    const result = await notificationRuleService.createNotificationRule(
      {
        customerId,
        channel,
        level,
        enabled,
        sourceFilters,
        wordPackageTypes,
        minScore,
        maxScore,
        webhookUrl,
        phoneNumbers,
        retryEnabled,
        maxRetryCount,
        retryIntervalMinutes,
      },
      operator,
      ip
    );
    res.success(result, '创建通知规则成功');
  } catch (err) {
    next(err);
  }
});

router.put('/:customerId/notification-rules/:id', async (req: Request, res: Response, next) => {
  try {
    await notificationRuleService.getNotificationRuleOrThrowByCustomer(
      req.params.id,
      req.params.customerId
    );

    const operator = (req.headers['x-operator'] as string) || 'system';
    const ip = req.ip;

    const rule = await notificationRuleService.updateNotificationRule(
      req.params.id,
      req.body,
      operator,
      ip
    );
    res.success(rule, '更新通知规则成功');
  } catch (err) {
    next(err);
  }
});

router.delete('/:customerId/notification-rules/:id', async (req: Request, res: Response, next) => {
  try {
    await notificationRuleService.getNotificationRuleOrThrowByCustomer(
      req.params.id,
      req.params.customerId
    );

    const operator = (req.headers['x-operator'] as string) || 'system';
    const ip = req.ip;

    await notificationRuleService.deleteNotificationRule(req.params.id, operator, ip);
    res.success(null, '删除通知规则成功');
  } catch (err) {
    next(err);
  }
});

export default router;
