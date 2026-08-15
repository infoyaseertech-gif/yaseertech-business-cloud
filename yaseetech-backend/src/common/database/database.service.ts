import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { assertValidUuid } from '../utils/uuid.util';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  actorType?: 'user' | 'support_agent' | 'system';
}

/**
 * The single source of truth for how application code talks to Postgres.
 *
 * This is the concrete implementation of the tenant-context resolution
 * pattern from Phase 1, Section 2.3:
 *
 *   Request -> JWT verified -> tenant_id extracted from token claims
 *           -> middleware/guard puts it on the request
 *           -> a service calls db.withTenantContext({ tenantId, ... }, fn)
 *           -> fn runs inside a transaction with app.current_tenant_id set,
 *              so every RLS policy in the schema is scoped automatically.
 *
 * Every write to the database in this codebase should go through
 * withTenantContext, EXCEPT the two narrow, explicitly-named exceptions
 * below (registration's first insert, and the auth lookup), which exist
 * because of a genuine chicken-and-egg problem: you can't set a tenant
 * context for a tenant that doesn't exist yet, or for a user whose tenant
 * you don't know yet. Both exceptions are deliberate and documented at
 * their call sites in AuthService, not silent RLS bypasses.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.pool = new Pool({
      connectionString: this.configService.get<string>('DATABASE_URL'),
      max: 10,
    });

    // Fail fast if the database isn't reachable, rather than the first
    // request silently hanging.
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      this.logger.log('Connected to PostgreSQL.');
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Runs `fn` inside a transaction with app.current_tenant_id (and
   * optionally app.current_user_id / app.current_actor_type, consumed by
   * the audit-log trigger from migration 009) set via SET LOCAL, so every
   * RLS-protected table this transaction touches is automatically scoped
   * to the caller's tenant -- the application-layer half of the
   * defense-in-depth pattern from Phase 1, Section 2.2.
   *
   * SET LOCAL doesn't support query parameters, so tenantId/userId are
   * interpolated directly -- safe only because assertValidUuid rejects
   * anything that isn't a well-formed UUID first.
   */
  async withTenantContext<T>(
    ctx: TenantContext,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const tenantId = assertValidUuid(ctx.tenantId, 'tenantId');
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);

      if (ctx.userId) {
        const userId = assertValidUuid(ctx.userId, 'userId');
        await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
      }
      await client.query(
        `SET LOCAL app.current_actor_type = '${ctx.actorType ?? 'user'}'`,
      );

      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * The narrow, explicitly-named exception documented in migration
   * 015_auth_lookup_policy.sql: finds a user by email WITHOUT a tenant
   * context, for the one legitimate case that needs it (login, and
   * registration's duplicate-email check). Sets app.auth_lookup = 'true'
   * for exactly this one query -- never anything client-controlled.
   *
   * Only ever call this from AuthService. Everywhere else, use
   * withTenantContext.
   */
  async findUserForLogin(email: string): Promise<{
    id: string;
    tenant_id: string;
    password_hash: string;
    status: string;
    full_name: string;
  } | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.auth_lookup = 'true'`);
      const result = await client.query(
        `SELECT id, tenant_id, password_hash, status, full_name
         FROM users
         WHERE email = $1
         LIMIT 1`,
        [email],
      );
      await client.query('COMMIT');
      return result.rows[0] ?? null;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * For genuinely tenant-independent queries only: platform tables with no
   * RLS at all (subscription_plans, tenants itself). Do NOT use this as a
   * shortcut around tenant context for anything that touches a
   * tenant-scoped table -- FORCE ROW LEVEL SECURITY means it will simply
   * return zero rows rather than leak data, but that's a confusing bug to
   * chase, not a safety net to rely on.
   */
  async queryPlatform<T = any>(text: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query(text, params);
    return result.rows;
  }

  /**
   * The second narrow exception to the tenant-context pattern (the first is
   * findUserForLogin above): registration has to INSERT the tenant row
   * itself before app.current_tenant_id can be set to anything meaningful.
   * This gives the caller a raw client in a transaction with NO session
   * variables set, so it can insert the tenant row, then call
   * client.query("SET LOCAL app.current_tenant_id = ...") itself partway
   * through, once the new tenant's id exists. Only AuthService.register
   * should use this -- everywhere else, use withTenantContext.
   */
  async withRawTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    const result = await this.pool.query('SELECT 1 AS ok');
    return result.rows[0]?.ok === 1;
  }
}
