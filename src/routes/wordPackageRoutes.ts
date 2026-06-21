import { Router, Request, Response } from 'express';
import * as wordPackageService from '../services/wordPackageService';
import { WordPackageType } from '../models';

const router = Router();

router.get('/:customerId/word-packages', async (req: Request, res: Response, next) => {
  try {
    const { customerId } = req.params;
    const type = req.query.type as WordPackageType | undefined;
    const result = await wordPackageService.listWordPackages(customerId, type);
    res.success(result, '获取词包列表成功');
  } catch (err) {
    next(err);
  }
});

router.get('/:customerId/word-packages/:id', async (req: Request, res: Response, next) => {
  try {
    const wp = await wordPackageService.getWordPackageOrThrowByCustomer(req.params.id, req.params.customerId);
    res.success(wp, '获取词包成功');
  } catch (err) {
    next(err);
  }
});

router.post('/:customerId/word-packages', async (req: Request, res: Response, next) => {
  try {
    const { customerId } = req.params;
    const { name, type, description, wordIds, defaultLevel } = req.body;
    if (!name || !type || !defaultLevel) {
      return res.fail('词包名称、类型和默认等级不能为空');
    }
    const result = await wordPackageService.createWordPackage({
      name,
      type,
      customerId,
      description,
      wordIds,
      defaultLevel,
    });
    res.success(result, '创建词包成功');
  } catch (err) {
    next(err);
  }
});

router.put('/:customerId/word-packages/:id', async (req: Request, res: Response, next) => {
  try {
    await wordPackageService.getWordPackageOrThrowByCustomer(req.params.id, req.params.customerId);
    const wp = await wordPackageService.updateWordPackage(req.params.id, req.body);
    res.success(wp, '更新词包成功');
  } catch (err) {
    next(err);
  }
});

router.delete('/:customerId/word-packages/:id', async (req: Request, res: Response, next) => {
  try {
    await wordPackageService.getWordPackageOrThrowByCustomer(req.params.id, req.params.customerId);
    await wordPackageService.deleteWordPackage(req.params.id);
    res.success(null, '删除词包成功');
  } catch (err) {
    next(err);
  }
});

router.post('/:customerId/word-packages/:id/words', async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const { wordIds } = req.body;
    if (!Array.isArray(wordIds) || wordIds.length === 0) {
      return res.fail('词ID列表不能为空');
    }
    await wordPackageService.getWordPackageOrThrowByCustomer(id, req.params.customerId);
    const wp = await wordPackageService.addWordsToPackage(id, wordIds);
    res.success(wp, '添加词到词包成功');
  } catch (err) {
    next(err);
  }
});

router.delete('/:customerId/word-packages/:id/words', async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const { wordIds } = req.body;
    if (!Array.isArray(wordIds) || wordIds.length === 0) {
      return res.fail('词ID列表不能为空');
    }
    await wordPackageService.getWordPackageOrThrowByCustomer(id, req.params.customerId);
    const wp = await wordPackageService.removeWordsFromPackage(id, wordIds);
    res.success(wp, '从词包移除词成功');
  } catch (err) {
    next(err);
  }
});

export default router;
