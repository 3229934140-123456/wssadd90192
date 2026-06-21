import app from './app';
import { config } from './config';
import { initDB } from './database';
import logger from './utils/logger';

async function startServer() {
  try {
    await initDB();
    logger.info('数据库初始化成功');

    app.listen(config.port, () => {
      logger.info(`服务已启动，监听端口 ${config.port}`);
      logger.info(`环境: ${config.env}`);
      logger.info(`健康检查: http://localhost:${config.port}/health`);
    });
  } catch (err: any) {
    logger.error('服务启动失败', { error: err.message });
    process.exit(1);
  }
}

startServer();
