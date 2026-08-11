import { jwtVerify, SignJWT } from 'jose';

export const IMPERSONATION_GRANT_HEADER = 'x-impersonation-grant';

/** Claims in a short-lived impersonation grant (RFC 8693-style delegation). */
export interface ImpersonationGrant {
  /** The impersonated user (target). */
  sub: string;
  /** The acting admin. */
  act: string;
  tenant: string;
}

/**
 * Mints and verifies impersonation grants (AUTH-5). A grant is issued only by
 * POST /auth/impersonate (which is permission-gated and audited), so a grant
 * cannot exist without a logged, authorised start. Short-lived and bound to both
 * the acting admin and the tenant.
 */
export class ImpersonationSigner {
  constructor(
    private readonly secret: Uint8Array | undefined,
    private readonly ttlSeconds = 30 * 60,
  ) {}

  isConfigured(): boolean {
    return !!this.secret;
  }

  async mint(grant: ImpersonationGrant): Promise<{ token: string; expiresAt: Date }> {
    if (!this.secret) throw new Error('Impersonation signing is not configured.');
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    const token = await new SignJWT({ act: grant.act, tenant: grant.tenant })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(grant.sub)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.secret);
    return { token, expiresAt };
  }

  async verify(token: string): Promise<ImpersonationGrant> {
    if (!this.secret) throw new Error('Impersonation signing is not configured.');
    const { payload } = await jwtVerify(token, this.secret);
    return { sub: String(payload.sub), act: String(payload.act), tenant: String(payload.tenant) };
  }
}

export function buildImpersonationSigner(env: NodeJS.ProcessEnv = process.env): ImpersonationSigner {
  const secret = env.IMPERSONATION_SECRET;
  return new ImpersonationSigner(secret ? new TextEncoder().encode(secret) : undefined);
}
