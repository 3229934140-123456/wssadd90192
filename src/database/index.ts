import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { Customer, Word, WordPackage, NotificationRule, Alert, AuditLog } from '../models';

interface DatabaseSchema {
  customers: Customer[];
  words: Word[];
  wordPackages: WordPackage[];
  notificationRules: NotificationRule[];
  alerts: Alert[];
  auditLogs: AuditLog[];
}

const defaultData: DatabaseSchema = {
  customers: [],
  words: [],
  wordPackages: [],
  notificationRules: [],
  alerts: [],
  auditLogs: [],
};

let db: Low<DatabaseSchema> | null = null;

export async function initDB(): Promise<Low<DatabaseSchema>> {
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const adapter = new JSONFile<DatabaseSchema>(config.dbPath);
  db = new Low(adapter, defaultData);
  await db.read();

  if (!db.data) {
    db.data = { ...defaultData };
  } else {
    db.data.customers = db.data.customers || [];
    db.data.words = db.data.words || [];
    db.data.wordPackages = db.data.wordPackages || [];
    db.data.notificationRules = db.data.notificationRules || [];
    db.data.alerts = db.data.alerts || [];
    db.data.auditLogs = db.data.auditLogs || [];
  }

  await db.write();
  return db;
}

export function getDB(): Low<DatabaseSchema> {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export async function saveDB(): Promise<void> {
  const database = getDB();
  await database.write();
}
