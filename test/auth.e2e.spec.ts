/**
 * End-to-end proof that a verified Supabase token drives the whole pipeline
 * (AUTH-1): session verification → tenant (TEN-1) → principal (§4.1) → RBAC,
 * with NO dev `x-*` headers. Database and directories are stubbed.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AUDIT_STORE, InMemoryAuditStore } from '../src/audit/audit-store';
import { AUTH_SETTINGS_DIRECTORY, TENANT_DIRECTORY, USER_DIRECTORY } from '../src/auth/directories';
import { Role } from '../src/authz/role';
import { PrismaService } from '../src/prisma/prisma.service';
import { StakeholdersService } from '../src/stakeholders/stakeholders.service';

const SECRET = 'e2e-supabase-secret';

function signToken(email: string, extra: Record<string, unknown> = {}, secret = SECRET) {
  return new SignJWT({ sub: 'sub-1', email, ...extra })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('authenticated')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

function signTokenAged(email: string, hoursAgo: number) {
  return new SignJWT({ sub: 'sub-1', email })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('authenticated')
    .setIssuedAt(Math.floor(Date.now() / 1000) - hoursAgo * 3600)
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(SECRET));
}

describe('Supabase auth (e2e)', () => {
  let app: INestApplication;
  let auditStore: InMemoryAuditStore;

  beforeAll(async () => {
    process.env.MASTER_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    process.env.ANALYTICS_DATABASE_URL = process.env.DATABASE_URL;
    process.env.SUPABASE_JWT_SECRET = SECRET;
    process.env.IMPERSONATION_SECRET = 'e2e-impersonation-secret';
    delete process.env.SUPABASE_ISSUER;

    auditStore = new InMemoryAuditStore();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: async () => {}, onModuleDestroy: async () => {} })
      .overrideProvider(StakeholdersService)
      .useValue({ list: async () => [], create: async (name: string) => ({ id: '1', name }) })
      .overrideProvider(AUDIT_STORE)
      .useValue(auditStore)
      .overrideProvider(TENANT_DIRECTORY)
      .useValue({
        findTenantSlugByDomain: async (d: string) => (d === 'acme.com' ? 'acme' : null),
        findTenantIdBySlug: async (slug: string) => (slug === 'acme' ? 'id-acme' : null),
      })
      .overrideProvider(USER_DIRECTORY)
      .useValue({
        findUser: async (slug: string, email: string) =>
          slug === 'acme' && email === 'ada@acme.com'
            ? { userId: 'u1', role: Role.FIELD, status: 'active' }
            : null,
        findUserById: async (slug: string, userId: string) => {
          if (slug !== 'acme') return null;
          if (userId === 'u-target') return { userId: 'u-target', role: Role.FIELD, status: 'active' };
          if (userId === 'u1') return { userId: 'u1', role: Role.ADMIN, status: 'active' };
          return null;
        },
      })
      .overrideProvider(AUTH_SETTINGS_DIRECTORY)
      .useValue({
        // idp_first so an app_metadata.role claim overrides the record (AUTH-2).
        findByTenant: async () => ({ precedence: 'idp_first', roleClaim: 'app_metadata.role' }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.IMPERSONATION_SECRET;
  });

  it('returns the identity on /auth/me for a valid token', async () => {
    const token = await signToken('ada@acme.com');
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          userId: 'u1',
          role: 'FIELD',
          tenant: 'acme',
          impersonation: { active: false },
        });
      });
  });

  it('401s /auth/me without a token', () =>
    request(app.getHttpServer()).get('/auth/me').expect(401));

  it('drives tenant + principal + RBAC from the token alone (no x-* headers)', async () => {
    const token = await signToken('ada@acme.com');
    await request(app.getHttpServer())
      .get('/stakeholders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('401s a tampered token', async () => {
    const token = await signToken('ada@acme.com');
    const tampered = `${token.slice(0, -3)}xyz`;
    await request(app.getHttpServer())
      .get('/stakeholders')
      .set('Authorization', `Bearer ${tampered}`)
      .expect(401);
  });

  it('401s a valid token whose user is not provisioned', async () => {
    const token = await signToken('ghost@acme.com');
    await request(app.getHttpServer())
      .get('/stakeholders')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('applies an IdP role claim over the record (AUTH-2, idp_first)', async () => {
    // The record role is FIELD (cannot create); the token elevates to ADMIN.
    const token = await signToken('ada@acme.com', { app_metadata: { role: 'ADMIN' } });
    await request(app.getHttpServer())
      .post('/stakeholders')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Agency' })
      .expect(201);
  });

  it('enforces the desktop session timeout at 8h (AUTH-4)', async () => {
    const token = await signTokenAged('ada@acme.com', 9);
    await request(app.getHttpServer())
      .get('/stakeholders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-client-type', 'desktop')
      .expect(401);
  });

  it('allows the same 9h-old session on mobile (12h timeout)', async () => {
    const token = await signTokenAged('ada@acme.com', 9);
    await request(app.getHttpServer())
      .get('/stakeholders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-client-type', 'mobile')
      .expect(200);
  });

  describe('impersonation (AUTH-5)', () => {
    // ada is an ADMIN here (idp_first app_metadata.role) so she may impersonate.
    const adminToken = () => signToken('ada@acme.com', { app_metadata: { role: 'ADMIN' } });

    it('lets an admin start an impersonation, and audits it', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/impersonate')
        .set('Authorization', `Bearer ${await adminToken()}`)
        .send({ targetUserId: 'u-target' })
        .expect(201);
      expect(res.body.grant).toEqual(expect.any(String));
      expect(res.body.impersonating).toEqual({ userId: 'u-target', role: 'FIELD' });

      const events = await auditStore.list('id-acme');
      expect(events.some((e) => e.action === 'impersonation.started' && e.resourceId === 'u-target')).toBe(true);
    });

    it('acts as the target (read) but is read-only (write blocked) and banner-flagged', async () => {
      const token = await adminToken();
      const start = await request(app.getHttpServer())
        .post('/auth/impersonate')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetUserId: 'u-target' })
        .expect(201);
      const grant: string = start.body.grant;

      // reads allowed as the target
      await request(app.getHttpServer())
        .get('/stakeholders')
        .set('Authorization', `Bearer ${token}`)
        .set('x-impersonation-grant', grant)
        .expect(200);

      // writes forbidden (read-only session)
      await request(app.getHttpServer())
        .post('/stakeholders')
        .set('Authorization', `Bearer ${token}`)
        .set('x-impersonation-grant', grant)
        .send({ name: 'x' })
        .expect(403);

      // /auth/me shows the impersonation banner state
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .set('x-impersonation-grant', grant)
        .expect(200)
        .expect((res) => {
          expect(res.body.userId).toBe('u-target');
          expect(res.body.impersonation).toEqual({ active: true, impersonatorUserId: 'u1', readOnly: true });
        });
    });

    it('rejects a forged grant', async () => {
      await request(app.getHttpServer())
        .get('/stakeholders')
        .set('Authorization', `Bearer ${await adminToken()}`)
        .set('x-impersonation-grant', 'not-a-valid-grant')
        .expect(401);
    });
  });
});
