import { Router, Request, Response } from 'express';
import * as wordService from '../services/wordService';
import { WordPackageType, NotificationLevel } from '../models';

const router = Router();

router.get('/:customerId/words', async (req: Request, res: Response, next) => {
  try {
    const { customerId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const type = req.query.type as WordPackageType | undefined;
    const level = req.query.level as NotificationLevel | undefined;
    const keyword = req.query.keyword as string | undefined;

    const result = await wordService.listWords(customerId, {
      type,
      level,
      keyword,
      page,
      pageSize,
    });
    res.success(result, '获取敏感词列表成功');
  } catch (err) {
    next(err);
  }
});

router.get('/:customerId/words/:id', async (req: Request, res: Response, next) => {
  try {
    const word = await wordService.getWordOrThrowByCustomer(req.params.id, req.params.customerId);
    res.success(word, '获取敏感词成功');
  } catch (err) {
    next(err);
  }
});

router.post('/:customerId/words', async (req: Request, res: Response, next) => {
  try {
    const { customerId } = req.params;
    const { word, type, level } = req.body;
    if (!word || !type || !level) {
      return res.fail('敏感词、类型和等级不能为空');
    }
    const result = await wordService.createWord({
      word,
      type,
      level,
      customerId,
    });
    res.success(result, '创建敏感词成功');
  } catch (err) {
    next(err);
  }
});

router.post('/:customerId/words/batch', async (req: Request, res: Response, next) => {
  try {
    const { customerId } = req.params;
    const { words } = req.body;
    if (!Array.isArray(words) || words.length === 0) {
      return res.fail('批量词列表不能为空');
    }
    const result = await wordService.batchCreateWords(customerId, words);
    res.success(result, `批量创建 ${result.length} 个敏感词成功`);
  } catch (err) {
    next(err);
  }
});

router.put('/:customerId/words/:id', async (req: Request, res: Response, next) => {
  try {
    await wordService.getWordOrThrowByCustomer(req.params.id, req.params.customerId);
    const word = await wordService.updateWord(req.params.id, req.body);
    res.success(word, '更新敏感词成功');
  } catch (err) {
    next(err);
  }
});

router.delete('/:customerId/words/:id', async (req: Request, res: Response, next) => {
  try {
    await wordService.getWordOrThrowByCustomer(req.params.id, req.params.customerId);
    await wordService.deleteWord(req.params.id);
    res.success(null, '删除敏感词成功');
  } catch (err) {
    next(err);
  }
});

export default router;
