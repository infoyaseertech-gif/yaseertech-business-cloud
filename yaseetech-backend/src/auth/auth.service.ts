import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { DatabaseService } from '../common/database/database.service';
import { AppException } from '../common/exceptions/app.exception';
import { assertValidUuid } from '../common/utils/uuid.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_COST = 12;
const BUSINESS_OWNER_ROLE_NAME = 'Business Owner';
const STARTER_PLAN_CODE = 'starter';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Self-serve signup: creates the tenant, its first business, a main
   * branch, and the founding user as Business Owner, all in one
   * transaction -- either the whole thing succeeds, or none of it does.
   *
   * Uses withRawTransaction (see DatabaseService) because the tenant row
   * has to exist before app.current_tenant_id can be set to anything.
   */
  async register(dto: RegisterDto): Promise<{ user: object } & TokenPair> {
    const existing = await this.db.findUserForLogin(dto.email);
    if (existing) {
      // v1 simplification (see migration 015): email is treated as unique
      // platform-wide, even though the DB constraint is per-tenant.
      throw new AppException(
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists.',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const { userId, tenantId } = await this.db.withRawTransaction(async (client) => {
      const planResult = await client.query(
        `SELECT id FROM subscription_plans WHERE code = $1`,
        [STARTER_PLAN_CODE],
      );
      if (planResult.rows.length === 0) {
        throw new AppException(
          'SUBSCRIPTION_PLAN_NOT_SEEDED',
          'The starter subscription plan is not seeded. Run the seed script or check subscription_plans.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      const starterPlanId = planResult.rows[0].id as string;

      const tenantResult = await client.query(
        `INSERT INTO tenants (name, slug, subscription_plan_id, subscription_status, trial_ends_at)
         VALUES ($1, $2, $3, 'trialing', now() + interval '14 days')
         RETURNING id`,
        [dto.businessName, slugify(dto.businessName), starterPlanId],
      );
      const newTenantId = tenantResult.rows[0].id as string;

      // From here on, tenant context is real -- set it for the rest of
      // this transaction so RLS applies to every subsequent insert.
      await client.query(
        `SET LOCAL app.current_tenant_id = '${assertValidUuid(newTenantId, 'newTenantId')}'`,
      );

      const businessResult = await client.query(
        `INSERT INTO businesses (tenant_id, legal_name, email)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [newTenantId, dto.businessName, dto.email],
      );
      const businessId = businessResult.rows[0].id as string;

      const branchResult = await client.query(
        `INSERT INTO branches (tenant_id, business_id, name, is_main_branch)
         VALUES ($1, $2, 'Main Branch', true)
         RETURNING id`,
        [newTenantId, businessId],
      );

      const userResult = await client.query(
        `INSERT INTO users (tenant_id, email, phone, password_hash, full_name, status, email_verified_at)
         VALUES ($1, $2, $3, $4, $5, 'active', NULL)
         RETURNING id`,
        [newTenantId, dto.email, dto.phone ?? null, passwordHash, dto.ownerFullName],
      );
      const newUserId = userResult.rows[0].id as string;

      const roleResult = await client.query(
        `SELECT id FROM roles WHERE name = $1 AND is_platform_role = false AND tenant_id IS NULL`,
        [BUSINESS_OWNER_ROLE_NAME],
      );
      if (roleResult.rows.length === 0) {
        throw new AppException(
          'ROLE_NOT_SEEDED',
          'The Business Owner role is not seeded. Run the seed script or check the roles table.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      await client.query(
        `INSERT INTO user_roles (user_id, role_id, tenant_id, branch_id)
         VALUES ($1, $2, $3, NULL)`, // NULL branch_id = applies to all branches, per Business Owner scope
        [newUserId, roleResult.rows[0].id, newTenantId],
      );

      // Bug fix, found while building invoicing (Phase 4b): registration
      // never created a chart of accounts. Only the demo seed data
      // (migration 014) had one, so POS checkout and invoicing would fail
      // with CHART_OF_ACCOUNTS_NOT_SEEDED for every genuinely registered
      // business. This is the standard v1 chart every tenant needs,
      // mirroring what the seed script did manually for its demo tenants.
      await client.query(
        `INSERT INTO accounts (tenant_id, code, name, account_type, is_system_account)
         VALUES
           ($1, '1000', 'Cash', 'asset', true),
           ($1, '1100', 'Accounts Receivable', 'asset', true),
           ($1, '1200', 'Inventory', 'asset', true),
           ($1, '4000', 'Sales Revenue', 'revenue', true),
           ($1, '5000', 'Cost of Goods Sold', 'expense', true)`,
        [newTenantId],
      );

      return { userId: newUserId, tenantId: newTenantId };
    });

    const tokens = await this.issueTokenPair(userId, tenantId);
    return {
      user: { id: userId, tenantId, email: dto.email, fullName: dto.ownerFullName },
      ...tokens,
    };
  }

  async login(dto: LoginDto): Promise<{ user: object } & TokenPair> {
    const row = await this.db.findUserForLogin(dto.email);

    // Same generic error whether the email doesn't exist or the password
    // is wrong -- never reveal which one it was.
    const invalidCredentials = () =>
      new AppException(
        'AUTH_INVALID_CREDENTIALS',
        'Incorrect email or password.',
        HttpStatus.UNAUTHORIZED,
      );

    if (!row) throw invalidCredentials();

    const passwordMatches = await bcrypt.compare(dto.password, row.password_hash);
    if (!passwordMatches) throw invalidCredentials();

    if (row.status !== 'active') {
      throw new AppException(
        'ACCOUNT_NOT_ACTIVE',
        'This account is not active. Contact your business owner or support.',
        HttpStatus.FORBIDDEN,
      );
    }

    const tokens = await this.issueTokenPair(row.id, row.tenant_id);
    return {
      user: { id: row.id, tenantId: row.tenant_id, fullName: row.full_name },
      ...tokens,
    };
  }

  /**
   * Refresh tokens are opaque random strings, not JWTs -- rotated on every
   * use (Phase 1, Section 4.1). The token format is "<tenantId>:<random>"
   * so the tenant context needed to look it up under RLS is available
   * without a special lookup policy (unlike login's email lookup, which
   * genuinely can't know the tenant in advance).
   */
  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const { tenantId } = parseRefreshToken(rawRefreshToken);
    const tokenHash = hashToken(rawRefreshToken);

    const result = await this.db.withTenantContext({ tenantId }, async (client) => {
      const rows = await client.query(
        `SELECT id, user_id, expires_at, revoked_at
         FROM refresh_tokens
         WHERE tenant_id = $1 AND token_hash = $2`,
        [tenantId, tokenHash],
      );

      if (rows.rows.length === 0) {
        throw new AppException(
          'AUTH_INVALID_REFRESH_TOKEN',
          'Refresh token is invalid.',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const token = rows.rows[0];

      if (token.revoked_at) {
        // A previously-rotated token being reused is a signal of possible
        // theft (Phase 1, Section 4.1) -- worth logging distinctly even
        // though the response is the same generic error.
        console.warn(
          `Reuse of revoked refresh token detected for user ${token.user_id}. Possible token theft.`,
        );
        throw new AppException(
          'AUTH_INVALID_REFRESH_TOKEN',
          'Refresh token is invalid.',
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (new Date(token.expires_at) < new Date()) {
        throw new AppException(
          'AUTH_REFRESH_TOKEN_EXPIRED',
          'Refresh token has expired. Please log in again.',
          HttpStatus.UNAUTHORIZED,
        );
      }

      return { userId: token.user_id as string, oldTokenId: token.id as string };
    });

    const tokens = await this.issueTokenPair(result.userId, tenantId, result.oldTokenId);
    return tokens;
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const { tenantId } = parseRefreshToken(rawRefreshToken);
    const tokenHash = hashToken(rawRefreshToken);

    await this.db.withTenantContext({ tenantId }, async (client) => {
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE tenant_id = $1 AND token_hash = $2 AND revoked_at IS NULL`,
        [tenantId, tokenHash],
      );
    });
  }

  private async issueTokenPair(
    userId: string,
    tenantId: string,
    oldRefreshTokenId?: string,
  ): Promise<TokenPair> {
    const accessExpiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    const accessToken = jwt.sign(
      { sub: userId, tenantId },
      this.configService.get<string>('JWT_ACCESS_SECRET')!,
      { expiresIn: accessExpiresIn } as jwt.SignOptions,
    );

    const refreshDays = parseInt(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN_DAYS') ?? '30',
      10,
    );
    const rawRefreshToken = `${tenantId}:${crypto.randomBytes(48).toString('hex')}`;
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    await this.db.withTenantContext({ tenantId, userId }, async (client) => {
      const inserted = await client.query(
        `INSERT INTO refresh_tokens (tenant_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [tenantId, userId, tokenHash, expiresAt],
      );

      if (oldRefreshTokenId) {
        // Rotation: the old token is revoked and linked forward, so reuse
        // of the old raw token is detectable (checked in refresh() above).
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = now(), replaced_by_id = $1
           WHERE id = $2`,
          [inserted.rows[0].id, oldRefreshTokenId],
        );
      }
    });

    return { accessToken, refreshToken: rawRefreshToken, expiresIn: accessExpiresIn };
  }
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function parseRefreshToken(raw: string): { tenantId: string } {
  const [tenantId] = raw.split(':');
  try {
    return { tenantId: assertValidUuid(tenantId ?? '', 'refreshToken.tenantId') };
  } catch {
    throw new AppException(
      'AUTH_INVALID_REFRESH_TOKEN',
      'Refresh token is malformed.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  // Appends a short random suffix so two businesses named similarly don't
  // collide on the unique slug constraint -- good enough for v1; a
  // dedicated "choose your workspace URL" step is a fine v2 improvement.
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}
