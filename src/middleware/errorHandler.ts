import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`[${req.method}] ${req.path} - ${message}`, {
    statusCode,
    error: err.message,
    stack: err.stack,
  });

  res.status(statusCode).json({
    code: statusCode,
    message,
    data: null,
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    code: 404,
    message: `Route ${req.method} ${req.path} not found`,
    data: null,
  });
}

export class AppError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}
