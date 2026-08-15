import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';
import { AppException } from '../exceptions/app.exception';
import { RequestUser } from './request-user.interface';

interface AccessTokenPayload {
  sub: string; // userId
  tenantId: string;
}

// The concrete implementation of Phase 1, Section 4.1 + 2.3: verifies the
// short-lived access token, and -- critically -- takes tenantId ONLY from
// the verified token, never from anything the client supplies in the URL,
// query string, or body. This is the one place tenant identity enters the
// system per request.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppException(
        'AUTH_MISSING_TOKEN',
        'Missing or malformed Authorization header.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = authHeader.slice('Bearer '.length);
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET')!;

    let payload: AccessTokenPayload;
    try {
      payload = jwt.verify(token, secret) as AccessTokenPayload;
    } catch (err) {
      const isExpired = err instanceof jwt.TokenExpiredError;
      throw new AppException(
        isExpired ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_INVALID_TOKEN',
        isExpired
          ? 'Access token has expired. Use /auth/refresh to get a new one.'
          : 'Access token is invalid.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const requestUser: RequestUser = {
      userId: payload.sub,
      tenantId: payload.tenantId,
    };

    (request as Request & { user: RequestUser }).user = requestUser;
    return true;
  }
}
