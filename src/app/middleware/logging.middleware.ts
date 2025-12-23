import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const startTime = Date.now();

    // Try to extract userId from JWT (if present)
    let userId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1], 'base64').toString(),
        );
        userId = payload.sub || null;
      } catch {
        // Token parsing failed, ignore
      }
    }

    const userInfo = userId ? `[${userId.substring(0, 8)}]` : '[anon]';

    // Log incoming request
    this.logger.log(`${userInfo} → ${method} ${originalUrl}`);

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      const errorMsg = res.locals?.errorMessage;
      const baseLog = `${userInfo} ← ${method} ${originalUrl} ${statusCode} - ${duration}ms`;
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
