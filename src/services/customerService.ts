import { getDB, saveDB } from '../database';
import { Customer } from '../models';
import { generateId, now } from '../utils/common';
import { AppError } from '../middleware/errorHandler';

export interface CreateCustomerDTO {
  name: string;
  contact: string;
  phone?: string;
  email?: string;
  webhookUrl?: string;
}

export interface UpdateCustomerDTO {
  name?: string;
  contact?: string;
  phone?: string;
  email?: string;
  webhookUrl?: string;
}

export async function listCustomers(page: number = 1, pageSize: number = 20): Promise<{ list: Customer[]; total: number }> {
  const db = getDB();
  const start = (page - 1) * pageSize;
  const list = db.data.customers.slice(start, start + pageSize);
  return { list, total: db.data.customers.length };
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const db = getDB();
  const customer = db.data.customers.find((c) => c.id === id);
  return customer || null;
}

export async function getCustomerOrThrow(id: string): Promise<Customer> {
  const customer = await getCustomer(id);
  if (!customer) {
    throw new AppError('客户不存在', 404);
  }
  return customer;
}

export async function createCustomer(dto: CreateCustomerDTO): Promise<Customer> {
  const db = getDB();

  const exists = db.data.customers.find((c) => c.name === dto.name);
  if (exists) {
    throw new AppError('客户名称已存在', 400);
  }

  const customer: Customer = {
    id: generateId(),
    name: dto.name,
    contact: dto.contact,
    phone: dto.phone,
    email: dto.email,
    webhookUrl: dto.webhookUrl,
    createdAt: now(),
    updatedAt: now(),
  };

  db.data.customers.push(customer);
  await saveDB();
  return customer;
}

export async function updateCustomer(id: string, dto: UpdateCustomerDTO): Promise<Customer> {
  const db = getDB();
  const customer = await getCustomerOrThrow(id);

  if (dto.name && dto.name !== customer.name) {
    const exists = db.data.customers.find((c) => c.name === dto.name && c.id !== id);
    if (exists) {
      throw new AppError('客户名称已存在', 400);
    }
  }

  Object.assign(customer, dto, { updatedAt: now() });
  await saveDB();
  return customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  const db = getDB();
  const index = db.data.customers.findIndex((c) => c.id === id);
  if (index === -1) {
    throw new AppError('客户不存在', 404);
  }

  db.data.customers.splice(index, 1);
  db.data.words = db.data.words.filter((w) => w.customerId !== id);
  db.data.wordPackages = db.data.wordPackages.filter((wp) => wp.customerId !== id);
  db.data.notificationRules = db.data.notificationRules.filter((r) => r.customerId !== id);
  db.data.alerts = db.data.alerts.filter((a) => a.customerId !== id);

  await saveDB();
}
