import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

// Catches everything -- our AppExceptions, Nest's built-in HttpExceptions
// (e.g. from ValidationPipe), and anything unexpected -- and normalizes it
// to { error: { code, message, details } } so API clients never have to
// handle more than one error shape.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Something went wrong on our end.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null && 'code' in body) {
        // Already one of our AppExceptions -- pass its fields through.
        const b = body as { code: string; message: string; details?: unknown };
        code = b.code;
        message = b.message;
        details = b.details;
      } else if (typeof body === 'object' && body !== null && 'message' in body) {
        // A framework-level exception, e.g. ValidationPipe's 400s.
        code = 'VALIDATION_ERROR';
        const b = body as { message: string | string[] };
        message = Array.isArray(b.message) ? b.message.join('; ') : b.message;
      } else {
        message = String(body);
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      }
    } else if (exception instanceof Error) {
      // An unexpected error -- log the real detail server-side, but never
      // leak internals (stack traces, DB error text) to the client.
      console.error(`Unhandled exception on ${request.method} ${request.url}:`, exception);
    }

    response.status(status).json({
      error: { code, message, ...(details !== undefined ? { details } : {}) },
    });
  }
}
