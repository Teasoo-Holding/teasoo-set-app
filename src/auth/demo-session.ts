import { jwtVerify, SignJWT } from 'jose';

export const DEMO_SESSION_HEADER = 'x-demo-session';

export interface DemoSessionClaims {
  sub: string; // persona user id
  tenant: string; // sandbox tenant slug
}

/**
 * Mints/verifies demo-session tokens (AUTH-3). These stand in for SSO in a
 * sandbox tenant's role-switcher. They are only ever issued for sandbox tenants
 * (the endpoint checks tenant kind), and carry no production access.
 */
export class DemoSessionSigner {
  constructor(
    private readonly secret: Uint8Array | undefined,
    private readonly ttlSeconds = 8 * 60 * 60,
  ) {}

  isConfigured(): boolean {
    return !!this.secret;
  }

  async mint(claims: DemoSessionClaims): Promise<{ token: string; expiresAt: Date }> {
    if (!this.secret) throw new Error('Demo sessions are not configured.');
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    const token = await new SignJWT({ tenant: claims.tenant, demo: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.secret);
    return { token, expiresAt };
  }

  async verify(token: string): Promise<DemoSessionClaims> {
    if (!this.secret) throw new Error('Demo sessions are not configured.');
    const { payload } = await jwtVerify(token, this.secret);
    if (payload.demo !== true) throw new Error('not a demo token');
    return { sub: String(payload.sub), tenant: String(payload.tenant) };
  }
}

export function buildDemoSessionSigner(env: NodeJS.ProcessEnv = process.env): DemoSessionSigner {
  const secret = env.DEMO_SESSION_SECRET;
  return new DemoSessionSigner(secret ? new TextEncoder().encode(secret) : undefined);
}
