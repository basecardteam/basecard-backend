import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    let errorMsg = 'Unknown error';
    if (typeof message === 'string') {
      errorMsg = message;
    } else if (typeof message === 'object' && message !== null) {
      // Handle NestJS default error object { statusCode, message, error }
      const msgObj = message as any;
      if (Array.isArray(msgObj.message)) {
        errorMsg = msgObj.message.join(', ');
      } else if (typeof msgObj.message === 'string') {
        errorMsg = msgObj.message;
      } else {
        errorMsg = JSON.stringify(message);
      }
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${request.method} ${request.url}] Internal Server Error: ${errorMsg}`,
        exception instanceof Error ? exception.stack : '',
      );
    } else if (status >= 400 && status < 500) {
      this.logger.warn(
        `[${request.method} ${request.url}] Client Error (${status}): ${errorMsg}`,
      );
    }

    response.status(status).json({
      success: false,
      result: null,
      error: errorMsg,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
