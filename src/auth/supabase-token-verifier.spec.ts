import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { buildSupabaseVerifier, SupabaseTokenVerifier } from './supabase-token-verifier';

const SECRET = 'test-supabase-jwt-secret-value';
const secretKey = new TextEncoder().encode(SECRET);
const ISSUER = 'https://proj.supabase.co/auth/v1';
const AUDIENCE = 'authenticated';

function signHs(claims: Record<string, unknown>, opts: { exp?: string; iss?: string; aud?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? AUDIENCE)
    .setExpirationTime(opts.exp ?? '1h')
    .sign(secretKey);
}

describe('SupabaseTokenVerifier (HS256)', () => {
  const verifier = new SupabaseTokenVerifier({ secret: secretKey, issuer: ISSUER, audience: AUDIENCE });

  it('verifies a valid token and returns sub + email', async () => {
    const token = await signHs({ sub: 'user-123', email: 'ada@acme.com' });
    const result = await verifier.verify(token);
    expect(result.sub).toBe('user-123');
    expect(result.email).toBe('ada@acme.com');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = await new SignJWT({ sub: 'x', email: 'a@acme.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-different-secret-entirely'));
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await signHs({ sub: 'x', email: 'a@acme.com' }, { exp: '-1h' });
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rejects a token from the wrong issuer', async () => {
    const token = await signHs({ sub: 'x', email: 'a@acme.com' }, { iss: 'https://evil.example/auth/v1' });
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await signHs({ sub: 'x', email: 'a@acme.com' }, { aud: 'some-other-service' });
    await expect(verifier.verify(token)).rejects.toThrow();
  });
});

describe('SupabaseTokenVerifier (asymmetric JWKS)', () => {
  it('verifies a token against a local JWKS', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    jwk.kid = 'k1';
    jwk.alg = 'RS256';

    const verifier = new SupabaseTokenVerifier({
      localJwks: { keys: [jwk] },
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const token = await new SignJWT({ sub: 'u9', email: 'grace@acme.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('1h')
      .sign(privateKey);

    const result = await verifier.verify(token);
    expect(result.email).toBe('grace@acme.com');
  });
});

describe('buildSupabaseVerifier', () => {
  it('is configured from a JWT secret', () => {
    expect(buildSupabaseVerifier({ SUPABASE_JWT_SECRET: 'x' }).isConfigured()).toBe(true);
  });

  it('is unconfigured with no env, and rejects tokens', async () => {
    const verifier = buildSupabaseVerifier({});
    expect(verifier.isConfigured()).toBe(false);
    await expect(verifier.verify('anything')).rejects.toThrow(/not configured/);
  });
});
