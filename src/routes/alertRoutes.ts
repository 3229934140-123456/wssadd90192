import { Router, Request, Response } from 'express';
import * as alertService from '../services/alertService';
import { DeliveryStatus, NotificationLevel } from '../models';

const router = Router();

router.post('/ingest', async (req: Request, res: Response, next) => {
  try {
    const { customerId, title, content, source, sourceUrl, sourceWeight, publishTime, extra } =
      req.body;

    if (!customerId || !title || !content || !source) {
      return res.fail('customerId、title、content、source 为必填项');
    }

    const alert = await alertService.processMonitorData({
      customerId,
      title,
      content,
      source,
      sourceUrl,
      sourceWeight,
      publishTime,
      extra,
    });

    if (!alert) {
      return res.success(null, '未命中敏感词，无需告警');
    }

    res.success(alert, '告警已生成');
  } catch (err) {
    next(err);
  }
});

router.get('/:customerId', async (req: Request, res: Response, next) => {
  try {
    const { customerId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const deliveryStatus = req.query.deliveryStatus as DeliveryStatus | undefined;
    const acknowledged = req.query.acknowledged !== undefined 
      ? req.query.acknowledged === 'true' 
      : undefined;
    const falsePositive = req.query.falsePositive !== undefined 
      ? req.query.falsePositive === 'true' 
      : undefined;
    const level = req.query.level as NotificationLevel | undefined;
    const source = req.query.source as string | undefined;
    const startTime = req.query.startTime
      ? parseInt(req.query.startTime as string)
      : undefined;
    const endTime = req.query.endTime ? parseInt(req.query.endTime as string) : undefined;

    const result = await alertService.listAlerts({
      customerId,
      deliveryStatus,
      acknowledged,
      falsePositive,
      level,
      source,
      startTime,
      endTime,
      page,
      pageSize,
    });

    res.success(result, '获取告警列表成功');
  } catch (err) {
    next(err);
  }
});

router.get('/:customerId/:id', async (req: Request, res: Response, next) => {
  try {
    const alert = await alertService.getAlertOrThrowByCustomer(req.params.id, req.params.customerId);
    res.success(alert, '获取告警详情成功');
  } catch (err) {
    next(err);
  }
});

router.get('/:customerId/:id/delivery', async (req: Request, res: Response, next) => {
  try {
    await alertService.getAlertOrThrowByCustomer(req.params.id, req.params.customerId);
    const status = await alertService.getAlertDeliveryStatus(req.params.id);
    res.success(status, '获取告警送达状态成功');
  } catch (err) {
    next(err);
  }
});

router.post('/:customerId/:id/acknowledge', async (req: Request, res: Response, next) => {
  try {
    await alertService.getAlertOrThrowByCustomer(req.params.id, req.params.customerId);
    const result = await alertService.acknowledgeAlert(req.params.id);
    res.success(result, '告警已确认');
  } catch (err) {
    next(err);
  }
});

router.post('/:customerId/:id/false-positive', async (req: Request, res: Response, next) => {
  try {
    await alertService.getAlertOrThrowByCustomer(req.params.id, req.params.customerId);
    const result = await alertService.markFalsePositive(req.params.id);
    res.success(result, '已标记为误报');
  } catch (err) {
    next(err);
  }
});

router.get('/:customerId/statistics/summary', async (req: Request, res: Response, next) => {
  try {
    const { customerId } = req.params;
    const days = parseInt(req.query.days as string) || 7;
    const stats = await alertService.getAlertStatistics(customerId, days);
    res.success(stats, '获取告警统计成功');
  } catch (err) {
    next(err);
  }
});

export default router;
