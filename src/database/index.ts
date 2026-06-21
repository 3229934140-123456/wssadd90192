import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { Customer, Word, WordPackage, NotificationRule, Alert } from '../models';

interface DatabaseSchema {
  customers: Customer[];
  words: Word[];
  wordPackages: WordPackage[];
  notificationRules: NotificationRule[];
  alerts: Alert[];
}

const defaultData: DatabaseSchema = {
  customers: [],
  words: [],
  wordPackages: [],
  notificationRules: [],
  alerts: [],
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
    db.data = defaultData;
    await db.write();
  }

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
