import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { DEMO_DIRECTORY, PrismaDemoDirectory } from './demo-directory';
import { buildDemoSessionSigner, DemoSessionSigner } from './demo-session';
import { DemoSessionMiddleware } from './demo-session.middleware';
import { DemoController } from './demo.controller';
import {
  AUTH_SETTINGS_DIRECTORY,
  AuthSettingsDirectory,
  PrismaAuthSettingsDirectory,
  PrismaTenantDirectory,
  PrismaUserDirectory,
  TENANT_DIRECTORY,
  TenantDirectory,
  USER_DIRECTORY,
  UserDirectory,
} from './directories';
import { buildImpersonationSigner, ImpersonationSigner } from './impersonation';
import { ImpersonationMiddleware } from './impersonation.middleware';
import { ReadOnlyGuard } from './read-only.guard';
import { SessionResolver } from './session-resolver';
import { SupabaseSessionMiddleware } from './supabase-session.middleware';
import { buildSupabaseVerifier, SupabaseTokenVerifier } from './supabase-token-verifier';

@Global()
@Module({
  controllers: [AuthController, DemoController],
  providers: [
    { provide: SupabaseTokenVerifier, useFactory: () => buildSupabaseVerifier() },
    { provide: ImpersonationSigner, useFactory: () => buildImpersonationSigner() },
    { provide: DemoSessionSigner, useFactory: () => buildDemoSessionSigner() },
    { provide: TENANT_DIRECTORY, useClass: PrismaTenantDirectory },
    { provide: USER_DIRECTORY, useClass: PrismaUserDirectory },
    { provide: DEMO_DIRECTORY, useClass: PrismaDemoDirectory },
    { provide: AUTH_SETTINGS_DIRECTORY, useClass: PrismaAuthSettingsDirectory },
    {
      provide: SessionResolver,
      useFactory: (
        v: SupabaseTokenVerifier,
        t: TenantDirectory,
        u: UserDirectory,
        a: AuthSettingsDirectory,
      ) => new SessionResolver(v, t, u, a),
      inject: [SupabaseTokenVerifier, TENANT_DIRECTORY, USER_DIRECTORY, AUTH_SETTINGS_DIRECTORY],
    },
    SupabaseSessionMiddleware,
    ImpersonationMiddleware,
    DemoSessionMiddleware,
    { provide: APP_GUARD, useClass: ReadOnlyGuard },
  ],
  exports: [
    SupabaseTokenVerifier,
    SessionResolver,
    SupabaseSessionMiddleware,
    ImpersonationMiddleware,
    ImpersonationSigner,
    DemoSessionMiddleware,
    DemoSessionSigner,
    DEMO_DIRECTORY,
    USER_DIRECTORY,
  ],
})
export class AuthModule {}
