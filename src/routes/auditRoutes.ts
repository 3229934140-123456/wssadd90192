import { Router, Request, Response } from 'express';
import * as auditService from '../services/auditService';
import { AuditEntityType, AuditAction } from '../models';

const router = Router();

router.get('/:customerId/audit-logs', async (req: Request, res: Response, next) => {
  try {
    const { customerId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const entityType = req.query.entityType as AuditEntityType | undefined;
    const entityId = req.query.entityId as string | undefined;
    const action = req.query.action as AuditAction | undefined;
    const operator = req.query.operator as string | undefined;
    const startTime = req.query.startTime
      ? parseInt(req.query.startTime as string)
      : undefined;
    const endTime = req.query.endTime
      ? parseInt(req.query.endTime as string)
      : undefined;

    const result = await auditService.listAuditLogs(customerId, {
      entityType,
      entityId,
      action,
      operator,
      startTime,
      endTime,
      page,
      pageSize,
    });

    res.success(result, '获取审计日志成功');
  } catch (err) {
    next(err);
  }
});

export default router;
