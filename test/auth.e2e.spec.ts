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
import { TENANT_DIRECTORY, USER_DIRECTORY } from '../src/auth/directories';
import { Role } from '../src/authz/role';
import { PrismaService } from '../src/prisma/prisma.service';
import { StakeholdersService } from '../src/stakeholders/stakeholders.service';

const SECRET = 'e2e-supabase-secret';

function signToken(email: string, secret = SECRET) {
  return new SignJWT({ sub: 'sub-1', email })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('authenticated')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

describe('Supabase auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MASTER_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    process.env.ANALYTICS_DATABASE_URL = process.env.DATABASE_URL;
    process.env.SUPABASE_JWT_SECRET = SECRET;
    delete process.env.SUPABASE_ISSUER;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: async () => {}, onModuleDestroy: async () => {} })
      .overrideProvider(StakeholdersService)
      .useValue({ list: async () => [], create: async (name: string) => ({ id: '1', name }) })
      .overrideProvider(TENANT_DIRECTORY)
      .useValue({ findTenantSlugByDomain: async (d: string) => (d === 'acme.com' ? 'acme' : null) })
      .overrideProvider(USER_DIRECTORY)
      .useValue({
        findUser: async (slug: string, email: string) =>
          slug === 'acme' && email === 'ada@acme.com'
            ? { userId: 'u1', role: Role.FIELD, status: 'active' }
            : null,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.SUPABASE_JWT_SECRET;
  });

  it('returns the identity on /auth/me for a valid token', async () => {
    const token = await signToken('ada@acme.com');
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ userId: 'u1', role: 'FIELD', functionId: undefined, tenant: 'acme' });
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
});
