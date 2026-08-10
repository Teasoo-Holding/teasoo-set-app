import { DeploymentConfig } from './deployment-config';

describe('DeploymentConfig', () => {
  it('defaults to shared mode with no region', () => {
    const cfg = new DeploymentConfig({});
    expect(cfg.mode).toBe('shared');
    expect(cfg.isDedicated()).toBe(false);
    expect(cfg.region).toBe('unspecified');
    expect(cfg.dedicatedTenant).toBeUndefined();
  });

  it('serves every tenant in shared mode', () => {
    const cfg = new DeploymentConfig({ DEPLOYMENT_MODE: 'shared' });
    expect(cfg.servesTenant('acme')).toBe(true);
    expect(cfg.servesTenant('globex')).toBe(true);
  });

  it('configures a dedicated instance for one tenant', () => {
    const cfg = new DeploymentConfig({
      DEPLOYMENT_MODE: 'dedicated',
      DEDICATED_TENANT_SLUG: 'unilever',
      DATA_RESIDENCY_REGION: 'eu-west-1',
    });
    expect(cfg.isDedicated()).toBe(true);
    expect(cfg.dedicatedTenant).toBe('unilever');
    expect(cfg.region).toBe('eu-west-1');
    expect(cfg.servesTenant('unilever')).toBe(true);
    expect(cfg.servesTenant('acme')).toBe(false);
  });

  it('fails fast when dedicated mode has no tenant', () => {
    expect(() => new DeploymentConfig({ DEPLOYMENT_MODE: 'dedicated' })).toThrow(
      /requires DEDICATED_TENANT_SLUG/,
    );
  });

  it('fails fast when a dedicated tenant is set in shared mode', () => {
    expect(
      () => new DeploymentConfig({ DEPLOYMENT_MODE: 'shared', DEDICATED_TENANT_SLUG: 'acme' }),
    ).toThrow(/must not be set in shared mode/);
  });

  it('rejects an unknown mode', () => {
    expect(() => new DeploymentConfig({ DEPLOYMENT_MODE: 'hybrid' })).toThrow(/Invalid DEPLOYMENT_MODE/);
  });

  it('reports its deployment info', () => {
    const cfg = new DeploymentConfig({ DEPLOYMENT_MODE: 'dedicated', DEDICATED_TENANT_SLUG: 'unilever' });
    expect(cfg.info()).toEqual({ mode: 'dedicated', dedicatedTenant: 'unilever', region: 'unspecified' });
  });
});
