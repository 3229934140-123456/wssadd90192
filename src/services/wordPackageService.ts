import { getDB, saveDB } from '../database';
import { WordPackage, WordPackageType, NotificationLevel } from '../models';
import { generateId, now } from '../utils/common';
import { AppError } from '../middleware/errorHandler';
import { getCustomerOrThrow } from './customerService';

export interface CreateWordPackageDTO {
  name: string;
  type: WordPackageType;
  customerId: string;
  description?: string;
  wordIds?: string[];
  defaultLevel: NotificationLevel;
}

export interface UpdateWordPackageDTO {
  name?: string;
  description?: string;
  defaultLevel?: NotificationLevel;
}

export async function listWordPackages(
  customerId: string,
  type?: WordPackageType
): Promise<WordPackage[]> {
  const db = getDB();
  let packages = db.data.wordPackages.filter((wp) => wp.customerId === customerId);
  if (type) {
    packages = packages.filter((wp) => wp.type === type);
  }
  return packages;
}

export async function getWordPackage(id: string): Promise<WordPackage | null> {
  const db = getDB();
  const wp = db.data.wordPackages.find((p) => p.id === id);
  return wp || null;
}

export async function getWordPackageOrThrow(id: string): Promise<WordPackage> {
  const wp = await getWordPackage(id);
  if (!wp) {
    throw new AppError('词包不存在', 404);
  }
  return wp;
}

export async function createWordPackage(dto: CreateWordPackageDTO): Promise<WordPackage> {
  await getCustomerOrThrow(dto.customerId);
  const db = getDB();

  const exists = db.data.wordPackages.find(
    (wp) => wp.customerId === dto.customerId && wp.name === dto.name && wp.type === dto.type
  );
  if (exists) {
    throw new AppError('该类型下已存在同名词包', 400);
  }

  const wp: WordPackage = {
    id: generateId(),
    name: dto.name,
    type: dto.type,
    customerId: dto.customerId,
    description: dto.description,
    wordIds: dto.wordIds || [],
    defaultLevel: dto.defaultLevel,
    createdAt: now(),
    updatedAt: now(),
  };

  db.data.wordPackages.push(wp);
  await saveDB();
  return wp;
}

export async function updateWordPackage(
  id: string,
  dto: UpdateWordPackageDTO
): Promise<WordPackage> {
  const wp = await getWordPackageOrThrow(id);
  const db = getDB();

  if (dto.name && dto.name !== wp.name) {
    const exists = db.data.wordPackages.find(
      (p) => p.customerId === wp.customerId && p.name === dto.name && p.type === wp.type && p.id !== id
    );
    if (exists) {
      throw new AppError('该类型下已存在同名词包', 400);
    }
  }

  Object.assign(wp, dto, { updatedAt: now() });
  await saveDB();
  return wp;
}

export async function deleteWordPackage(id: string): Promise<void> {
  const db = getDB();
  const index = db.data.wordPackages.findIndex((wp) => wp.id === id);
  if (index === -1) {
    throw new AppError('词包不存在', 404);
  }
  db.data.wordPackages.splice(index, 1);
  await saveDB();
}

export async function addWordsToPackage(packageId: string, wordIds: string[]): Promise<WordPackage> {
  const wp = await getWordPackageOrThrow(packageId);
  const db = getDB();

  for (const wordId of wordIds) {
    const word = db.data.words.find((w) => w.id === wordId && w.customerId === wp.customerId);
    if (!word) {
      throw new AppError(`敏感词 ${wordId} 不存在`, 400);
    }
    if (!wp.wordIds.includes(wordId)) {
      wp.wordIds.push(wordId);
    }
  }

  wp.updatedAt = now();
  await saveDB();
  return wp;
}

export async function removeWordsFromPackage(
  packageId: string,
  wordIds: string[]
): Promise<WordPackage> {
  const wp = await getWordPackageOrThrow(packageId);
  wp.wordIds = wp.wordIds.filter((id) => !wordIds.includes(id));
  wp.updatedAt = now();
  await saveDB();
  return wp;
}
