import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Extract userId from JWT (same logic as middleware)
    let userId: string | null = null;
    const authHeader = request.headers?.authorization;
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

    return next.handle().pipe(
      tap((data) => {
        // Only log response body in debug mode for non-sensitive endpoints
        if (data && typeof data === 'object') {
          const dataStr = JSON.stringify(data);
          // Truncate if too long
          const truncated =
            dataStr.length > 500 ? dataStr.substring(0, 500) + '...' : dataStr;
          // this.logger.debug(`${userInfo} Response: ${truncated}`);
        }
      }),
    );
  }
}
