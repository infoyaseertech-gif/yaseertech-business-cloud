import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../guards/request-user.interface';

// Usage: findMe(@CurrentUser() user: RequestUser) -- pulls the
// { userId, tenantId } that JwtAuthGuard attached to the request, so
// controllers never touch req.user directly.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: RequestUser }>();
    return request.user;
  },
);
