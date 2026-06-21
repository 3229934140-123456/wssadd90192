import { getDB, saveDB } from '../database';
import { Word, WordPackageType, NotificationLevel } from '../models';
import { generateId, now } from '../utils/common';
import { AppError } from '../middleware/errorHandler';
import { getCustomerOrThrow } from './customerService';

export interface CreateWordDTO {
  word: string;
  type: WordPackageType;
  level: NotificationLevel;
  customerId: string;
}

export interface UpdateWordDTO {
  word?: string;
  type?: WordPackageType;
  level?: NotificationLevel;
}

export async function listWords(
  customerId: string,
  options?: {
    type?: WordPackageType;
    level?: NotificationLevel;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{ list: Word[]; total: number }> {
  const db = getDB();
  let words = db.data.words.filter((w) => w.customerId === customerId);

  if (options?.type) {
    words = words.filter((w) => w.type === options.type);
  }
  if (options?.level) {
    words = words.filter((w) => w.level === options.level);
  }
  if (options?.keyword) {
    const kw = options.keyword.toLowerCase();
    words = words.filter((w) => w.word.toLowerCase().includes(kw));
  }

  const page = options?.page || 1;
  const pageSize = options?.pageSize || 20;
  const start = (page - 1) * pageSize;

  return {
    list: words.slice(start, start + pageSize),
    total: words.length,
  };
}

export async function getWord(id: string): Promise<Word | null> {
  const db = getDB();
  const word = db.data.words.find((w) => w.id === id);
  return word || null;
}

export async function getWordOrThrow(id: string): Promise<Word> {
  const word = await getWord(id);
  if (!word) {
    throw new AppError('敏感词不存在', 404);
  }
  return word;
}

export async function getWordOrThrowByCustomer(id: string, customerId: string): Promise<Word> {
  const word = await getWordOrThrow(id);
  if (word.customerId !== customerId) {
    throw new AppError('敏感词不存在', 404);
  }
  return word;
}

export async function createWord(dto: CreateWordDTO): Promise<Word> {
  await getCustomerOrThrow(dto.customerId);
  const db = getDB();

  const exists = db.data.words.find(
    (w) => w.customerId === dto.customerId && w.word === dto.word && w.type === dto.type
  );
  if (exists) {
    throw new AppError('该类型下已存在相同的敏感词', 400);
  }

  const word: Word = {
    id: generateId(),
    word: dto.word,
    type: dto.type,
    level: dto.level,
    customerId: dto.customerId,
    createdAt: now(),
    updatedAt: now(),
  };

  db.data.words.push(word);
  await saveDB();
  return word;
}

export async function batchCreateWords(
  customerId: string,
  words: Array<{ word: string; type: WordPackageType; level: NotificationLevel }>
): Promise<Word[]> {
  await getCustomerOrThrow(customerId);
  const db = getDB();
  const created: Word[] = [];
  const currentTs = now();

  for (const item of words) {
    const exists = db.data.words.find(
      (w) => w.customerId === customerId && w.word === item.word && w.type === item.type
    );
    if (exists) continue;

    const word: Word = {
      id: generateId(),
      word: item.word,
      type: item.type,
      level: item.level,
      customerId,
      createdAt: currentTs,
      updatedAt: currentTs,
    };
    db.data.words.push(word);
    created.push(word);
  }

  await saveDB();
  return created;
}

export async function updateWord(id: string, dto: UpdateWordDTO): Promise<Word> {
  const word = await getWordOrThrow(id);
  const db = getDB();

  if (dto.word && (dto.word !== word.word || dto.type)) {
    const checkType = dto.type || word.type;
    const exists = db.data.words.find(
      (w) =>
        w.customerId === word.customerId &&
        w.word === dto.word &&
        w.type === checkType &&
        w.id !== id
    );
    if (exists) {
      throw new AppError('该类型下已存在相同的敏感词', 400);
    }
  }

  Object.assign(word, dto, { updatedAt: now() });
  await saveDB();
  return word;
}

export async function deleteWord(id: string): Promise<void> {
  const db = getDB();
  const index = db.data.words.findIndex((w) => w.id === id);
  if (index === -1) {
    throw new AppError('敏感词不存在', 404);
  }
  db.data.words.splice(index, 1);

  for (const wp of db.data.wordPackages) {
    const idx = wp.wordIds.indexOf(id);
    if (idx !== -1) {
      wp.wordIds.splice(idx, 1);
      wp.updatedAt = now();
    }
  }

  await saveDB();
}

export async function getWordsByCustomer(customerId: string): Promise<Word[]> {
  const db = getDB();
  return db.data.words.filter((w) => w.customerId === customerId);
}
