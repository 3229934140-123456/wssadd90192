import { Router, Request, Response } from 'express';
import * as customerService from '../services/customerService';

const router = Router();

router.get('/', async (req: Request, res: Response, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const result = await customerService.listCustomers(page, pageSize);
    res.success(result, '获取客户列表成功');
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next) => {
  try {
    const customer = await customerService.getCustomerOrThrow(req.params.id);
    res.success(customer, '获取客户信息成功');
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next) => {
  try {
    const { name, contact, phone, email, webhookUrl } = req.body;
    if (!name || !contact) {
      return res.fail('客户名称和联系人不能为空');
    }
    const customer = await customerService.createCustomer({
      name,
      contact,
      phone,
      email,
      webhookUrl,
    });
    res.success(customer, '创建客户成功');
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next) => {
  try {
    const customer = await customerService.updateCustomer(req.params.id, req.body);
    res.success(customer, '更新客户成功');
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next) => {
  try {
    await customerService.deleteCustomer(req.params.id);
    res.success(null, '删除客户成功');
  } catch (err) {
    next(err);
  }
});

export default router;
