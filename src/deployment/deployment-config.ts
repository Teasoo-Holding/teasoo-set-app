export type DeploymentMode = 'shared' | 'dedicated';

export interface DeploymentInfo {
  mode: DeploymentMode;
  dedicatedTenant?: string;
  region: string;
}

/**
 * How this running instance is deployed (EP1-S4 / TEN-4).
 *
 *  - `shared`    — the default multi-tenant instance.
 *  - `dedicated` — a single enterprise tenant's own instance: SAME codebase, but
 *                  a separate database, key store and master key (all supplied
 *                  via the usual DATABASE_URL / ANALYTICS_DATABASE_URL /
 *                  MASTER_ENCRYPTION_KEY env vars pointed at isolated resources),
 *                  optionally in a specific data-residency region.
 *
 * Read once at startup and validated fail-fast, so a misconfigured instance
 * refuses to boot rather than serving the wrong tenant.
 *
 * NB: whether to actually stand up a dedicated instance for Unilever, and in
 * which region, is open question OQ-1 in DECISIONS.md — this class is the
 * capability, not that decision.
 */
export class DeploymentConfig {
  readonly mode: DeploymentMode;
  readonly dedicatedTenant?: string;
  readonly region: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const mode = (env.DEPLOYMENT_MODE ?? 'shared').trim().toLowerCase();
    if (mode !== 'shared' && mode !== 'dedicated') {
      throw new Error(`Invalid DEPLOYMENT_MODE '${mode}' (expected 'shared' or 'dedicated').`);
    }
    this.mode = mode;
    this.region = env.DATA_RESIDENCY_REGION?.trim() || 'unspecified';

    const dedicatedTenant = env.DEDICATED_TENANT_SLUG?.trim();
    if (mode === 'dedicated') {
      if (!dedicatedTenant) {
        throw new Error('DEPLOYMENT_MODE=dedicated requires DEDICATED_TENANT_SLUG.');
      }
      this.dedicatedTenant = dedicatedTenant;
    } else if (dedicatedTenant) {
      throw new Error('DEDICATED_TENANT_SLUG must not be set in shared mode.');
    }
  }

  isDedicated(): boolean {
    return this.mode === 'dedicated';
  }

  /** In dedicated mode, only the contracted tenant is served; shared serves all. */
  servesTenant(tenant: string): boolean {
    return this.mode === 'shared' || tenant === this.dedicatedTenant;
  }

  info(): DeploymentInfo {
    return { mode: this.mode, dedicatedTenant: this.dedicatedTenant, region: this.region };
  }
}
