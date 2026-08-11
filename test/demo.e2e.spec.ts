/**
 * End-to-end proof of demo/sandbox mode (AUTH-3): the persona role-switcher
 * works for a sandbox tenant and is structurally refused for a production
 * tenant; a demo session is watermarked. Database stubbed.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DEMO_DIRECTORY } from '../src/auth/demo-directory';
import { Role } from '../src/authz/role';
import { PrismaService } from '../src/prisma/prisma.service';
import { StakeholdersService } from '../src/stakeholders/stakeholders.service';

describe('Demo/sandbox mode (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MASTER_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    process.env.ANALYTICS_DATABASE_URL = process.env.DATABASE_URL;
    process.env.DEMO_SESSION_SECRET = 'e2e-demo-secret';

    const persona = { userId: 'p1', email: 'demo.chidi@acme-demo', role: Role.FIELD };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: async () => {}, onModuleDestroy: async () => {} })
      .overrideProvider(StakeholdersService)
      .useValue({ list: async () => [], create: async (name: string) => ({ id: '1', name }) })
      .overrideProvider(DEMO_DIRECTORY)
      .useValue({
        findTenantKind: async (slug: string) =>
          slug === 'acme-demo' ? 'sandbox' : slug === 'acme-prod' ? 'production' : null,
        listPersonas: async (slug: string) => (slug === 'acme-demo' ? [persona] : []),
        findPersona: async (slug: string, id: string) =>
          slug === 'acme-demo' && id === 'p1' ? persona : null,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DEMO_SESSION_SECRET;
  });

  it('lists personas for a sandbox tenant', () =>
    request(app.getHttpServer())
      .get('/auth/demo/personas?tenant=acme-demo')
      .expect(200)
      .expect((res) => {
        expect(res.body.demo).toBe(true);
        expect(res.body.personas).toHaveLength(1);
      }));

  it('refuses the role-switcher for a production tenant (404)', () =>
    request(app.getHttpServer()).get('/auth/demo/personas?tenant=acme-prod').expect(404));

  it('switches to a persona and drives an authenticated request, watermarked', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/demo/switch')
      .send({ tenant: 'acme-demo', personaId: 'p1' })
      .expect(201);
    const token: string = res.body.token;
    expect(token).toEqual(expect.any(String));

    // The demo session drives a normal request, and is watermarked.
    await request(app.getHttpServer())
      .get('/stakeholders')
      .set('x-demo-session', token)
      .expect(200)
      .expect('X-Teasoo-Demo', 'true');

    // /auth/me reports demo mode.
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('x-demo-session', token)
      .expect(200)
      .expect((meRes) => {
        expect(meRes.body.demo).toBe(true);
        expect(meRes.body.userId).toBe('p1');
      });
  });

  it('cannot mint a demo session for a production tenant', () =>
    request(app.getHttpServer())
      .post('/auth/demo/switch')
      .send({ tenant: 'acme-prod', personaId: 'p1' })
      .expect(404));
});
