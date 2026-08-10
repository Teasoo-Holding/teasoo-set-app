import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { TenantDirectory, TENANT_DIRECTORY, UserDirectory, USER_DIRECTORY } from './directories';
import { AppSession, extractDomain } from './session';
import { SupabaseTokenVerifier } from './supabase-token-verifier';

/**
 * Turns a Supabase access token into a verified AppSession (AUTH-1):
 *   verify token → email → domain → tenant → user → { tenant, role, function }.
 *
 * Every failure is a 401 — a token we cannot fully resolve to a provisioned user
 * grants nothing.
 */
@Injectable()
export class SessionResolver {
  constructor(
    private readonly verifier: SupabaseTokenVerifier,
    @Inject(TENANT_DIRECTORY) private readonly tenants: TenantDirectory,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
  ) {}

  async resolve(token: string): Promise<AppSession> {
    let email: string | undefined;
    try {
      const verified = await this.verifier.verify(token);
      email = verified.email?.toLowerCase();
    } catch {
      throw new UnauthorizedException('Invalid session token.');
    }
    if (!email) throw new UnauthorizedException('Token has no email claim.');

    const domain = extractDomain(email);
    if (!domain) throw new UnauthorizedException('Token email is malformed.');

    const tenantSlug = await this.tenants.findTenantSlugByDomain(domain);
    if (!tenantSlug) throw new UnauthorizedException('No tenant is registered for this email domain.');

    const user = await this.users.findUser(tenantSlug, email);
    if (!user) throw new UnauthorizedException('User is not provisioned for this tenant.');
    if (user.status !== 'active') throw new UnauthorizedException('User account is not active.');

    return { tenantSlug, userId: user.userId, role: user.role, functionId: user.functionId };
  }
}
