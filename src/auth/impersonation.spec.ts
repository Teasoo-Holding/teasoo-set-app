import { buildImpersonationSigner, ImpersonationSigner } from './impersonation';

const secret = new TextEncoder().encode('impersonation-test-secret');

describe('ImpersonationSigner', () => {
  const signer = new ImpersonationSigner(secret);

  it('mints and verifies a grant', async () => {
    const { token, expiresAt } = await signer.mint({ sub: 'target', act: 'admin', tenant: 'acme' });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(await signer.verify(token)).toEqual({ sub: 'target', act: 'admin', tenant: 'acme' });
  });

  it('rejects a grant signed with a different secret', async () => {
    const other = new ImpersonationSigner(new TextEncoder().encode('other-secret'));
    const { token } = await other.mint({ sub: 't', act: 'a', tenant: 'acme' });
    await expect(signer.verify(token)).rejects.toThrow();
  });

  it('rejects an expired grant', async () => {
    const shortLived = new ImpersonationSigner(secret, -1);
    const { token } = await shortLived.mint({ sub: 't', act: 'a', tenant: 'acme' });
    await expect(signer.verify(token)).rejects.toThrow();
  });

  it('is unconfigured without a secret', () => {
    const signer = buildImpersonationSigner({});
    expect(signer.isConfigured()).toBe(false);
    return expect(signer.mint({ sub: 't', act: 'a', tenant: 'acme' })).rejects.toThrow(/not configured/);
  });
});
