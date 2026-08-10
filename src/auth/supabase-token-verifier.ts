import { createLocalJWKSet, createRemoteJWKSet, JSONWebKeySet, jwtVerify, JWTPayload } from 'jose';

export interface VerifiedToken {
  sub: string;
  email?: string;
  claims: JWTPayload;
}

interface VerifierOptions {
  /** HS256 shared secret (Supabase legacy JWT secret). */
  secret?: Uint8Array;
  /** Remote JWKS endpoint (Supabase asymmetric keys). */
  jwksUrl?: string;
  /** Local JWKS, for tests. */
  localJwks?: JSONWebKeySet;
  issuer?: string;
  audience?: string;
}

/**
 * Verifies a Supabase-issued access token (AUTH-1). Supabase runs the SSO
 * handshake and signs the JWT; the app only verifies it — signature, issuer,
 * audience and expiry — then trusts its claims. Supports the HS256 shared secret
 * and asymmetric JWKS (remote or local).
 */
export class SupabaseTokenVerifier {
  private readonly remoteJwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly options: VerifierOptions) {
    if (options.jwksUrl) {
      this.remoteJwks = createRemoteJWKSet(new URL(options.jwksUrl));
    }
  }

  /** True when a verification key is configured; false disables token auth. */
  isConfigured(): boolean {
    return !!(this.options.secret || this.options.jwksUrl || this.options.localJwks);
  }

  async verify(token: string): Promise<VerifiedToken> {
    const verifyOptions = { issuer: this.options.issuer, audience: this.options.audience };

    let payload: JWTPayload;
    if (this.options.secret) {
      ({ payload } = await jwtVerify(token, this.options.secret, verifyOptions));
    } else if (this.options.localJwks) {
      ({ payload } = await jwtVerify(token, createLocalJWKSet(this.options.localJwks), verifyOptions));
    } else if (this.remoteJwks) {
      ({ payload } = await jwtVerify(token, this.remoteJwks, verifyOptions));
    } else {
      throw new Error('Supabase token verification is not configured.');
    }

    return {
      sub: String(payload.sub ?? ''),
      email: typeof payload.email === 'string' ? payload.email : undefined,
      claims: payload,
    };
  }
}

/** Build a verifier from environment, or an unconfigured one that rejects all tokens. */
export function buildSupabaseVerifier(env: NodeJS.ProcessEnv = process.env): SupabaseTokenVerifier {
  const issuer = env.SUPABASE_ISSUER || undefined;
  const audience = env.SUPABASE_AUDIENCE || 'authenticated';

  if (env.SUPABASE_JWT_SECRET) {
    return new SupabaseTokenVerifier({
      secret: new TextEncoder().encode(env.SUPABASE_JWT_SECRET),
      issuer,
      audience,
    });
  }
  if (env.SUPABASE_JWKS_URL) {
    return new SupabaseTokenVerifier({ jwksUrl: env.SUPABASE_JWKS_URL, issuer, audience });
  }
  // Unconfigured: no token can be verified. Routes still work via the dev header
  // fallback until Supabase auth is configured.
  return new SupabaseTokenVerifier({});
}
