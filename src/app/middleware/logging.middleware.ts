import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const startTime = Date.now();
    const requestId = uuidv4();

    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      const errorMsg = res.locals?.errorMessage;
      const baseLog = `[${requestId}] ${method} ${originalUrl} ${statusCode} - ${duration}ms`;
      const logMessage = errorMsg ? `${baseLog} - ${errorMsg}` : baseLog;

      if (statusCode >= 500) {
        this.logger.error(logMessage);
      } else if (statusCode >= 400) {
        this.logger.warn(logMessage);
      } else {
        this.logger.log(logMessage);
      }
    });

    next();
  }
}
