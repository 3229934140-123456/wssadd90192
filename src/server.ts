import app from './app';
import { config } from './config';
import { initDB } from './database';
import logger from './utils/logger';
import { processRetryQueue } from './services/alertService';

let retryTimer: NodeJS.Timeout | null = null;

async function startServer() {
  try {
    await initDB();
    logger.info('数据库初始化成功');

    app.listen(config.port, () => {
      logger.info(`服务已启动，监听端口 ${config.port}`);
      logger.info(`环境: ${config.env}`);
      logger.info(`健康检查: http://localhost:${config.port}/health`);
    });

    startRetryScheduler();
  } catch (err: any) {
    logger.error('服务启动失败', { error: err.message });
    process.exit(1);
  }
}

function startRetryScheduler() {
  const intervalMs = 60 * 1000;
  logger.info(`[Retry] 自动重试调度已启动，间隔 ${intervalMs / 1000} 秒`);

  retryTimer = setInterval(async () => {
    try {
      const processed = await processRetryQueue();
      if (processed > 0) {
        logger.info(`[Retry] 自动重试完成，处理了 ${processed} 条记录`);
      }
    } catch (err: any) {
      logger.error('[Retry] 自动重试调度异常', { error: err.message });
    }
  }, intervalMs);
}

process.on('SIGTERM', () => {
  if (retryTimer) {
    clearInterval(retryTimer);
    logger.info('[Retry] 自动重试调度已停止');
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  if (retryTimer) {
    clearInterval(retryTimer);
    logger.info('[Retry] 自动重试调度已停止');
  }
  process.exit(0);
});

startServer();
