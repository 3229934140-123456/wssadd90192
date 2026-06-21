import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

declare global {
  namespace Express {
    interface Response {
      success: (data?: any, message?: string) => void;
      fail: (message: string, code?: number) => void;
    }
  }
}

export function responseFormatter(req: Request, res: Response, next: NextFunction) {
  res.success = function (data: any = null, message: string = 'success') {
    this.json({
      code: 0,
      message,
      data,
    });
  };

  res.fail = function (message: string, code: number = 400) {
    this.status(code).json({
      code,
      message,
      data: null,
    });
  };

  next();
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  logger.info(`[${req.method}] ${req.path}`, {
    ip: req.ip,
    query: req.query,
    body: req.body && Object.keys(req.body).length > 0 ? '[BODY]' : undefined,
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`[${req.method}] ${req.path} ${res.statusCode} - ${duration}ms`);
  });

  next();
}
