import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
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
import { SessionResolver } from './session-resolver';
import { SupabaseSessionMiddleware } from './supabase-session.middleware';
import { buildSupabaseVerifier, SupabaseTokenVerifier } from './supabase-token-verifier';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    { provide: SupabaseTokenVerifier, useFactory: () => buildSupabaseVerifier() },
    { provide: TENANT_DIRECTORY, useClass: PrismaTenantDirectory },
    { provide: USER_DIRECTORY, useClass: PrismaUserDirectory },
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
  ],
  exports: [SupabaseTokenVerifier, SessionResolver, SupabaseSessionMiddleware],
})
export class AuthModule {}
