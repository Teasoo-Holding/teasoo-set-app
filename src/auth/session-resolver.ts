import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DEFAULT_AUTH_POLICY } from './auth-settings';
import { extractIdpAttrs, resolveAttributes } from './claim-resolver';
import {
  AUTH_SETTINGS_DIRECTORY,
  AuthSettingsDirectory,
  TENANT_DIRECTORY,
  TenantDirectory,
  USER_DIRECTORY,
  UserDirectory,
} from './directories';
import { AppSession, extractDomain } from './session';
import { ClientType, DEFAULT_SESSION_TIMEOUT, isSessionExpired, sessionExpiry, sessionStart } from './session-timeout';
import { SupabaseTokenVerifier, VerifiedToken } from './supabase-token-verifier';

/**
 * Turns a Supabase access token into a verified AppSession (AUTH-1), then
 * resolves role/function/reporting-line per the tenant's precedence policy
 * (AUTH-2). Every failure is a 401 — a token we cannot fully resolve to a
 * provisioned user grants nothing.
 */
@Injectable()
export class SessionResolver {
  constructor(
    private readonly verifier: SupabaseTokenVerifier,
    @Inject(TENANT_DIRECTORY) private readonly tenants: TenantDirectory,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
    @Inject(AUTH_SETTINGS_DIRECTORY) private readonly authSettings: AuthSettingsDirectory,
  ) {}

  async resolve(token: string, clientType: ClientType = 'desktop'): Promise<AppSession> {
    let verified: VerifiedToken;
    try {
      verified = await this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid session token.');
    }

    const email = verified.email?.toLowerCase();
    if (!email) throw new UnauthorizedException('Token has no email claim.');

    const domain = extractDomain(email);
    if (!domain) throw new UnauthorizedException('Token email is malformed.');

    const tenantSlug = await this.tenants.findTenantSlugByDomain(domain);
    if (!tenantSlug) throw new UnauthorizedException('No tenant is registered for this email domain.');

    const policy = (await this.authSettings.findByTenant(tenantSlug)) ?? DEFAULT_AUTH_POLICY;

    // AUTH-4: enforce the tenant's per-client session timeout. We can only apply
    // it when the token exposes a start time; a token without one is left to the
    // token's own expiry (already checked by the verifier).
    const timeout = policy.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT;
    const startSeconds = sessionStart(verified.claims, timeout.authTimeClaim);
    let sessionExpiresAt: Date | undefined;
    if (startSeconds !== undefined) {
      if (isSessionExpired(startSeconds, clientType, timeout)) {
        throw new UnauthorizedException('Session has timed out; sign in again.');
      }
      sessionExpiresAt = sessionExpiry(startSeconds, clientType, timeout);
    }

    const user = await this.users.findUser(tenantSlug, email);
    if (!user) throw new UnauthorizedException('User is not provisioned for this tenant.');
    if (user.status !== 'active') throw new UnauthorizedException('User account is not active.');

    // AUTH-2: combine the record and IdP claims per the tenant's policy.
    const idp = extractIdpAttrs(verified.claims, policy);
    const resolved = resolveAttributes(
      { role: user.role, functionId: user.functionId, reportsToId: user.reportsToId },
      idp,
      policy.precedence,
    );

    return {
      tenantSlug,
      userId: user.userId,
      role: resolved.role,
      functionId: resolved.functionId,
      reportsToId: resolved.reportsToId,
      sessionExpiresAt,
    };
  }
}
