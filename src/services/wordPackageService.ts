import { getDB, saveDB } from '../database';
import { WordPackage, WordPackageType, NotificationLevel, Word, BatchImportResult, BatchImportWordItem } from '../models';
import { generateId, now } from '../utils/common';
import { AppError } from '../middleware/errorHandler';
import { getCustomerOrThrow } from './customerService';
import { getWordsByIds, createWord } from './wordService';
import { createAuditLog, diffObject } from './auditService';

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

export async function getWordPackageOrThrowByCustomer(id: string, customerId: string): Promise<WordPackage> {
  const wp = await getWordPackageOrThrow(id);
  if (wp.customerId !== customerId) {
    throw new AppError('词包不存在', 404);
  }
  return wp;
}

export async function getWordPackagesContainingWord(
  customerId: string,
  wordId: string
): Promise<WordPackage[]> {
  const db = getDB();
  return db.data.wordPackages.filter(
    (wp) => wp.customerId === customerId && wp.wordIds.includes(wordId)
  );
}

export async function getWordPackagesByIds(
  customerId: string,
  packageIds: string[]
): Promise<WordPackage[]> {
  const db = getDB();
  return db.data.wordPackages.filter(
    (wp) => wp.customerId === customerId && packageIds.includes(wp.id)
  );
}

export async function createWordPackage(
  dto: CreateWordPackageDTO,
  operator: string = 'system',
  ip?: string
): Promise<WordPackage> {
  await getCustomerOrThrow(dto.customerId);
  const db = getDB();

  const exists = db.data.wordPackages.find(
    (wp) => wp.customerId === dto.customerId && wp.name === dto.name && wp.type === dto.type
  );
  if (exists) {
    throw new AppError('该类型下已存在同名词包', 400);
  }

  if (dto.wordIds && dto.wordIds.length > 0) {
    const words = await getWordsByIds(dto.customerId, dto.wordIds);
    if (words.length !== dto.wordIds.length) {
      throw new AppError('部分敏感词不存在或不属于当前客户', 400);
    }
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

  await createAuditLog({
    customerId: dto.customerId,
    entityType: 'word_package',
    entityId: wp.id,
    entityName: wp.name,
    action: 'create',
    operator,
    after: { ...wp },
    ip,
  });

  return wp;
}

export async function updateWordPackage(
  id: string,
  dto: UpdateWordPackageDTO,
  operator: string = 'system',
  ip?: string
): Promise<WordPackage> {
  const wp = await getWordPackageOrThrow(id);
  const before = { ...wp };
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

  const changes = diffObject(before, { ...wp });

  await createAuditLog({
    customerId: wp.customerId,
    entityType: 'word_package',
    entityId: wp.id,
    entityName: wp.name,
    action: 'update',
    operator,
    before,
    after: { ...wp },
    changes,
    ip,
  });

  return wp;
}

export async function deleteWordPackage(
  id: string,
  operator: string = 'system',
  ip?: string
): Promise<void> {
  const db = getDB();
  const wp = await getWordPackageOrThrow(id);
  const before = { ...wp };

  const index = db.data.wordPackages.findIndex((wp) => wp.id === id);
  if (index === -1) {
    throw new AppError('词包不存在', 404);
  }
  db.data.wordPackages.splice(index, 1);
  await saveDB();

  await createAuditLog({
    customerId: wp.customerId,
    entityType: 'word_package',
    entityId: wp.id,
    entityName: wp.name,
    action: 'delete',
    operator,
    before,
    ip,
  });
}

export async function addWordsToPackage(
  packageId: string,
  wordIds: string[],
  operator: string = 'system',
  ip?: string
): Promise<WordPackage> {
  const wp = await getWordPackageOrThrow(packageId);
  const before = { ...wp };
  const db = getDB();

  const words = await getWordsByIds(wp.customerId, wordIds);
  if (words.length !== wordIds.length) {
    throw new AppError('部分敏感词不存在或不属于当前客户', 400);
  }

  for (const wordId of wordIds) {
    if (!wp.wordIds.includes(wordId)) {
      wp.wordIds.push(wordId);
    }
  }

  wp.updatedAt = now();
  await saveDB();

  const changes = diffObject(before, { ...wp });

  await createAuditLog({
    customerId: wp.customerId,
    entityType: 'word_package',
    entityId: wp.id,
    entityName: wp.name,
    action: 'update',
    operator,
    before,
    after: { ...wp },
    changes: ['wordIds(added)', ...changes],
    ip,
  });

  return wp;
}

export async function removeWordsFromPackage(
  packageId: string,
  wordIds: string[],
  operator: string = 'system',
  ip?: string
): Promise<WordPackage> {
  const wp = await getWordPackageOrThrow(packageId);
  const before = { ...wp };

  wp.wordIds = wp.wordIds.filter((id) => !wordIds.includes(id));
  wp.updatedAt = now();
  await saveDB();

  const changes = diffObject(before, { ...wp });

  await createAuditLog({
    customerId: wp.customerId,
    entityType: 'word_package',
    entityId: wp.id,
    entityName: wp.name,
    action: 'update',
    operator,
    before,
    after: { ...wp },
    changes: ['wordIds(removed)', ...changes],
    ip,
  });

  return wp;
}

export async function getPackageWords(packageId: string): Promise<Word[]> {
  const wp = await getWordPackageOrThrow(packageId);
  const db = getDB();
  return db.data.words.filter((w) => wp.wordIds.includes(w.id));
}

export async function batchImportWords(
  customerId: string,
  items: BatchImportWordItem[],
  operator: string = 'system'
): Promise<BatchImportResult> {
  await getCustomerOrThrow(customerId);
  const db = getDB();

  const result: BatchImportResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    successItems: [],
    failedItems: [],
    skippedItems: [],
  };

  const packageCache: Record<string, WordPackage> = {};

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const row = i + 1;

    try {
      if (!item.word || !item.word.trim()) {
        result.failed++;
        result.failedItems.push({ word: item.word || '(空)', reason: '词不能为空', row });
        continue;
      }
      if (!item.type) {
        result.failed++;
        result.failedItems.push({ word: item.word, reason: '类型不能为空', row });
        continue;
      }
      if (!item.level) {
        result.failed++;
        result.failedItems.push({ word: item.word, reason: '等级不能为空', row });
        continue;
      }

      if (item.customerId && item.customerId !== customerId) {
        result.failed++;
        result.failedItems.push({ 
          word: item.word, 
          reason: `客户归属不匹配（期望: ${customerId}, 实际: ${item.customerId}）`, 
          row 
        });
        continue;
      }

      const existingWord = db.data.words.find(
        (w) => w.customerId === customerId && w.word === item.word && w.type === item.type
      );

      if (existingWord) {
        result.skipped++;
        result.skippedItems.push({ word: item.word, reason: '已存在相同词', row });
        continue;
      }

      const createdWord = await createWord(
        {
          word: item.word,
          type: item.type,
          level: item.level,
          customerId,
        },
        operator + '(import)'
      );

      const packages: string[] = [];

      if (item.packageName) {
        const packageType = item.packageType || item.type;
        const packageDefaultLevel = item.packageDefaultLevel || item.level;
        const cacheKey = `${packageType}-${item.packageName}`;
        let wordPackage = packageCache[cacheKey];

        if (!wordPackage) {
          const existingPackage = db.data.wordPackages.find(
            (wp) =>
              wp.customerId === customerId &&
              wp.name === item.packageName &&
              wp.type === packageType
          );

          if (existingPackage) {
            wordPackage = existingPackage;
          } else {
            const newPackage: WordPackage = {
              id: generateId(),
              name: item.packageName,
              type: packageType,
              customerId,
              defaultLevel: packageDefaultLevel,
              wordIds: [],
              createdAt: now(),
              updatedAt: now(),
            };
            db.data.wordPackages.push(newPackage);
            wordPackage = newPackage;
            packageCache[cacheKey] = newPackage;

            await createAuditLog({
              customerId,
              entityType: 'word_package',
              entityId: newPackage.id,
              entityName: newPackage.name,
              action: 'create',
              operator: operator + '(import)',
              after: { ...newPackage },
            });
          }
        }

        if (!wordPackage.wordIds.includes(createdWord.id)) {
          wordPackage.wordIds.push(createdWord.id);
          wordPackage.updatedAt = now();
        }

        packages.push(wordPackage.name);
      }

      result.success++;
      result.successItems.push({
        word: item.word,
        id: createdWord.id,
        packages: packages.length > 0 ? packages : undefined,
      });
    } catch (err: any) {
      result.failed++;
      result.failedItems.push({
        word: item.word,
        reason: err.message || '未知错误',
        row,
      });
    }
  }

  await saveDB();
  return result;
}

export async function exportWordsWithPackages(
  customerId: string
): Promise<Array<{ 
  word: string; 
  type: WordPackageType; 
  level: NotificationLevel; 
  customerId: string;
  packages: Array<{ name: string; type: WordPackageType; defaultLevel: NotificationLevel }> 
}>> {
  const db = getDB();
  const words = db.data.words.filter((w) => w.customerId === customerId);
  const packages = db.data.wordPackages.filter((wp) => wp.customerId === customerId);

  return words.map((word) => {
    const wordPackages = packages.filter((wp) => wp.wordIds.includes(word.id));
    return {
      word: word.word,
      type: word.type,
      level: word.level,
      customerId: word.customerId,
      packages: wordPackages.map((wp) => ({
        name: wp.name,
        type: wp.type,
        defaultLevel: wp.defaultLevel,
      })),
    };
  });
}
