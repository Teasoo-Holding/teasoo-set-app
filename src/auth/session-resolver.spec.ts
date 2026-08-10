import { UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { Role } from '../authz/role';
import { DirectoryUser, TenantDirectory, UserDirectory } from './directories';
import { SessionResolver } from './session-resolver';
import { SupabaseTokenVerifier } from './supabase-token-verifier';

const SECRET = new TextEncoder().encode('resolver-secret');
const ISSUER = 'https://proj.supabase.co/auth/v1';

const token = (email: string) =>
  new SignJWT({ sub: 'sub-1', email })
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
}
class FakeUsers implements UserDirectory {
  constructor(private readonly users: Record<string, DirectoryUser>) {}
  async findUser(tenantSlug: string, email: string) {
    return this.users[`${tenantSlug}:${email}`] ?? null;
  }
}

function resolver(tenants: TenantDirectory, users: UserDirectory) {
  const verifier = new SupabaseTokenVerifier({ secret: SECRET, issuer: ISSUER, audience: 'authenticated' });
  return new SessionResolver(verifier, tenants, users);
}

describe('SessionResolver', () => {
  const tenants = new FakeTenants({ 'acme.com': 'acme' });
  const users = new FakeUsers({
    'acme:ada@acme.com': { userId: 'u1', role: Role.FUNCTION_LEAD, functionId: 'reg', status: 'active' },
    'acme:sus@acme.com': { userId: 'u2', role: Role.FIELD, status: 'suspended' },
  });

  it('resolves a verified token to a session', async () => {
    const session = await resolver(tenants, users).resolve(await token('Ada@acme.com'));
    expect(session).toEqual({ tenantSlug: 'acme', userId: 'u1', role: Role.FUNCTION_LEAD, functionId: 'reg' });
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
    await expect(resolver(tenants, users).resolve(await token('sus@acme.com'))).rejects.toThrow(
      /not active/,
    );
  });
});
