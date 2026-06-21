import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  env: process.env.NODE_ENV || 'development',
  dbPath: path.resolve(process.env.DB_PATH || './data/db.json'),
  notification: {
    sms: {
      enabled: false,
      provider: 'mock',
    },
    wechat: {
      enabled: false,
      webhookUrl: '',
    },
    dingtalk: {
      enabled: false,
      webhookUrl: '',
    },
  },
  defaultSourceWeight: 1.0,
};
