import { UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { Role } from '../authz/role';
import { AuthSettingsDirectory, DirectoryUser, TenantDirectory, UserDirectory } from './directories';
import { TenantAuthPolicy } from './auth-settings';
import { SessionResolver } from './session-resolver';
import { SupabaseTokenVerifier } from './supabase-token-verifier';

const SECRET = new TextEncoder().encode('resolver-secret');
const ISSUER = 'https://proj.supabase.co/auth/v1';

const token = (email: string, extra: Record<string, unknown> = {}) =>
  new SignJWT({ sub: 'sub-1', email, ...extra })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setExpirationTime('1h')
    .sign(SECRET);

class FakeTenants implements TenantDirectory {
  constructor(private readonly map: Record<string, string>) {}
  async findTenantSlugByDomain(domain: string) {
    return this.map[domain] ?? null;
  }
  async findTenantIdBySlug(slug: string) {
    return `id-${slug}`;
  }
}
class FakeUsers implements UserDirectory {
  constructor(private readonly users: Record<string, DirectoryUser>) {}
  async findUser(tenantSlug: string, email: string) {
    return this.users[`${tenantSlug}:${email}`] ?? null;
  }
  async findUserById(_tenantSlug: string, userId: string) {
    return Object.values(this.users).find((u) => u.userId === userId) ?? null;
  }
}
class FakeAuthSettings implements AuthSettingsDirectory {
  constructor(private readonly policy: TenantAuthPolicy | null = null) {}
  async findByTenant() {
    return this.policy;
  }
}

function resolver(tenants: TenantDirectory, users: UserDirectory, settings?: AuthSettingsDirectory) {
  const verifier = new SupabaseTokenVerifier({ secret: SECRET, issuer: ISSUER, audience: 'authenticated' });
  return new SessionResolver(verifier, tenants, users, settings ?? new FakeAuthSettings());
}

describe('SessionResolver', () => {
  const tenants = new FakeTenants({ 'acme.com': 'acme' });
  const users = new FakeUsers({
    'acme:ada@acme.com': { userId: 'u1', role: Role.FUNCTION_LEAD, functionId: 'reg', reportsToId: 'boss', status: 'active' },
    'acme:sus@acme.com': { userId: 'u2', role: Role.FIELD, status: 'suspended' },
  });

  it('resolves a verified token to a session (record-first default)', async () => {
    const session = await resolver(tenants, users).resolve(await token('Ada@acme.com'));
    expect(session).toEqual({
      tenantSlug: 'acme',
      userId: 'u1',
      role: Role.FUNCTION_LEAD,
      functionId: 'reg',
      reportsToId: 'boss',
    });
  });

  it('rejects an invalid token', async () => {
    await expect(resolver(tenants, users).resolve('not-a-jwt')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown email domain', async () => {
    await expect(resolver(tenants, users).resolve(await token('bob@other.com'))).rejects.toThrow(
      /No tenant is registered/,
    );
  });

  it('rejects an email with no provisioned user', async () => {
    await expect(resolver(tenants, users).resolve(await token('ghost@acme.com'))).rejects.toThrow(
      /not provisioned/,
    );
  });

  it('rejects an inactive user', async () => {
    await expect(resolver(tenants, users).resolve(await token('sus@acme.com'))).rejects.toThrow(/not active/);
  });

  describe('AUTH-2 claim precedence', () => {
    const idpFirst = new FakeAuthSettings({ precedence: 'idp_first', roleClaim: 'app_metadata.role' });

    it('idp_first lets an IdP role claim override the record', async () => {
      const session = await resolver(tenants, users, idpFirst).resolve(
        await token('ada@acme.com', { app_metadata: { role: 'ADMIN' } }),
      );
      expect(session.role).toBe(Role.ADMIN);
    });

    it('idp_first falls back to the record when the claim is absent', async () => {
      const session = await resolver(tenants, users, idpFirst).resolve(await token('ada@acme.com'));
      expect(session.role).toBe(Role.FUNCTION_LEAD);
    });

    it('record_first ignores an IdP role claim', async () => {
      const recordFirst = new FakeAuthSettings({ precedence: 'record_first', roleClaim: 'app_metadata.role' });
      const session = await resolver(tenants, users, recordFirst).resolve(
        await token('ada@acme.com', { app_metadata: { role: 'ADMIN' } }),
      );
      expect(session.role).toBe(Role.FUNCTION_LEAD);
    });
  });

  describe('AUTH-4 session timeout', () => {
    const tokenIssuedHoursAgo = (hours: number) =>
      new SignJWT({ sub: 'sub-1', email: 'ada@acme.com' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(ISSUER)
        .setAudience('authenticated')
        .setIssuedAt(Math.floor(Date.now() / 1000) - hours * 3600)
        .setExpirationTime('30d')
        .sign(SECRET);

    it('rejects a session past the desktop timeout (8h default)', async () => {
      await expect(resolver(tenants, users).resolve(await tokenIssuedHoursAgo(9), 'desktop')).rejects.toThrow(
        /timed out/,
      );
    });

    it('accepts the same age on mobile (12h default) and reports expiry', async () => {
      const session = await resolver(tenants, users).resolve(await tokenIssuedHoursAgo(9), 'mobile');
      expect(session.role).toBe(Role.FUNCTION_LEAD);
      expect(session.sessionExpiresAt).toBeInstanceOf(Date);
    });

    it('accepts a fresh session', async () => {
      const session = await resolver(tenants, users).resolve(await tokenIssuedHoursAgo(0), 'desktop');
      expect(session.sessionExpiresAt).toBeInstanceOf(Date);
    });
  });
});
