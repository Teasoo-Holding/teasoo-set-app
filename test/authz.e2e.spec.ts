/**
 * End-to-end proof that the permission matrix is enforced through the real Nest
 * HTTP stack: tenant + principal middleware, the global PermissionsGuard, and
 * the @RequirePermissions metadata on the controller.
 *
 * The database is stubbed out — this test is about authorization, not storage.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StakeholdersService } from '../src/stakeholders/stakeholders.service';

describe('Authorization (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MASTER_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    process.env.ANALYTICS_DATABASE_URL = process.env.DATABASE_URL;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: async () => {}, onModuleDestroy: async () => {} })
      .overrideProvider(StakeholdersService)
      .useValue({
        list: async () => [{ id: '1', name: 'NAFDAC' }],
        create: async (name: string) => ({ id: '2', name }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (role?: string) => {
    const req = request(app.getHttpServer()).post('/stakeholders').set('x-tenant-id', 'acme');
    if (role) req.set('x-user-id', 'u1').set('x-user-role', role);
    return req.send({ name: 'New Agency' });
  };

  it('lets a Function Lead create a stakeholder', () => post('FUNCTION_LEAD').expect(201));

  it('forbids a Field user from creating a stakeholder directly (REG-4)', () =>
    post('FIELD').expect(403));

  it('rejects an unauthenticated request to a protected route', () => post(undefined).expect(401));

  it('lets a Field user read the directory', () =>
    request(app.getHttpServer())
      .get('/stakeholders')
      .set('x-tenant-id', 'acme')
      .set('x-user-id', 'u1')
      .set('x-user-role', 'FIELD')
      .expect(200));

  it('rejects a request with no resolvable tenant', () =>
    request(app.getHttpServer())
      .get('/stakeholders')
      // no x-tenant-id, and a host the middleware treats as tenant-less
      .set('Host', 'localhost')
      .set('x-user-id', 'u1')
      .set('x-user-role', 'ADMIN')
      .expect(400));
});
