import { HttpException, HttpStatus } from '@nestjs/common';

// Every deliberate error thrown by application code (not framework-level
// validation errors) should be one of these, so the response body always
// matches the { error: { code, message, details } } shape from Phase 1,
// Section 3 -- code first (machine-readable, stable, safe to switch on in
// client code), message second (human-readable), details last (optional,
// structured).
export class AppException extends HttpException {
  constructor(
    code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}
