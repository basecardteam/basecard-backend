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
    const requestId = request.res?.getHeader('x-request-id') || 'unknown';

    return next.handle().pipe(
      tap((data) => {
        // Only log response body in debug mode for non-sensitive endpoints
        const { method, originalUrl } = request;

        // Skip logging for large responses or binary data
        if (data && typeof data === 'object') {
          const dataStr = JSON.stringify(data);
          // Truncate if too long
          const truncated =
            dataStr.length > 500 ? dataStr.substring(0, 500) + '...' : dataStr;
          this.logger.debug(`[${requestId}] Response: ${truncated}`);
        }
      }),
    );
  }
}
