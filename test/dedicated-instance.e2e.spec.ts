/**
 * End-to-end proof that a dedicated instance (TEN-4) serves only its contracted
 * tenant and rejects all others, through the real Nest stack. Database stubbed.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StakeholdersService } from '../src/stakeholders/stakeholders.service';

describe('Dedicated instance (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MASTER_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    process.env.ANALYTICS_DATABASE_URL = process.env.DATABASE_URL;
    process.env.DEPLOYMENT_MODE = 'dedicated';
    process.env.DEDICATED_TENANT_SLUG = 'unilever';
    process.env.DATA_RESIDENCY_REGION = 'eu-west-1';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: async () => {}, onModuleDestroy: async () => {} })
      .overrideProvider(StakeholdersService)
      .useValue({ list: async () => [], create: async (name: string) => ({ id: '1', name }) })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DEPLOYMENT_MODE;
    delete process.env.DEDICATED_TENANT_SLUG;
    delete process.env.DATA_RESIDENCY_REGION;
  });

  const listAs = (tenant: string) =>
    request(app.getHttpServer())
      .get('/stakeholders')
      .set('x-tenant-id', tenant)
      .set('x-user-id', 'u1')
      .set('x-user-role', 'FIELD');

  it('serves the contracted tenant', () => listAs('unilever').expect(200));

  it('returns 404 for any other tenant', () => listAs('acme').expect(404));

  it('reports its mode and region on /health', () =>
    request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.deployment).toEqual({
          mode: 'dedicated',
          dedicatedTenant: 'unilever',
          region: 'eu-west-1',
        });
      }));
});
