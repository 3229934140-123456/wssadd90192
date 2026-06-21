import { getDB, saveDB } from '../database';
import { AuditLog, AuditAction, AuditEntityType } from '../models';
import { generateId, now } from '../utils/common';

export interface CreateAuditLogDTO {
  customerId: string;
  entityType: AuditEntityType;
  entityId: string;
  entityName?: string;
  action: AuditAction;
  operator: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  changes?: string[];
  ip?: string;
  userAgent?: string;
}

export async function createAuditLog(dto: CreateAuditLogDTO): Promise<AuditLog> {
  const db = getDB();

  const log: AuditLog = {
    id: generateId(),
    customerId: dto.customerId,
    entityType: dto.entityType,
    entityId: dto.entityId,
    entityName: dto.entityName,
    action: dto.action,
    operator: dto.operator,
    before: dto.before,
    after: dto.after,
    changes: dto.changes,
    timestamp: now(),
    ip: dto.ip,
    userAgent: dto.userAgent,
  };

  db.data.auditLogs.push(log);
  await saveDB();
  return log;
}

export async function listAuditLogs(
  customerId: string,
  options?: {
    entityType?: AuditEntityType;
    entityId?: string;
    action?: AuditAction;
    operator?: string;
    startTime?: number;
    endTime?: number;
    page?: number;
    pageSize?: number;
  }
): Promise<{ list: AuditLog[]; total: number }> {
  const db = getDB();
  let logs = db.data.auditLogs.filter((l) => l.customerId === customerId);

  if (options?.entityType) {
    logs = logs.filter((l) => l.entityType === options.entityType);
  }
  if (options?.entityId) {
    logs = logs.filter((l) => l.entityId === options.entityId);
  }
  if (options?.action) {
    logs = logs.filter((l) => l.action === options.action);
  }
  if (options?.operator) {
    logs = logs.filter((l) => l.operator === options.operator);
  }
  if (options?.startTime) {
    logs = logs.filter((l) => l.timestamp >= options.startTime!);
  }
  if (options?.endTime) {
    logs = logs.filter((l) => l.timestamp <= options.endTime!);
  }

  logs.sort((a, b) => b.timestamp - a.timestamp);

  const page = options?.page || 1;
  const pageSize = options?.pageSize || 20;
  const start = (page - 1) * pageSize;

  return {
    list: logs.slice(start, start + pageSize),
    total: logs.length,
  };
}

export function diffObject(
  before: Record<string, any>,
  after: Record<string, any>
): string[] {
  const changes: string[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    if (key === 'updatedAt' || key === 'createdAt') continue;
    const beforeVal = JSON.stringify(before[key]);
    const afterVal = JSON.stringify(after[key]);
    if (beforeVal !== afterVal) {
      changes.push(key);
    }
  }

  return changes;
}
