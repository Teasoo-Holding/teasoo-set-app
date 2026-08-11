import { buildDemoSessionSigner, DemoSessionSigner } from './demo-session';

const secret = new TextEncoder().encode('demo-test-secret');

describe('DemoSessionSigner', () => {
  const signer = new DemoSessionSigner(secret);

  it('mints and verifies a demo token', async () => {
    const { token } = await signer.mint({ sub: 'persona-1', tenant: 'acme-demo' });
    expect(await signer.verify(token)).toEqual({ sub: 'persona-1', tenant: 'acme-demo' });
  });

  it('rejects a token signed with a different secret', async () => {
    const other = new DemoSessionSigner(new TextEncoder().encode('nope'));
    const { token } = await other.mint({ sub: 'p', tenant: 't' });
    await expect(signer.verify(token)).rejects.toThrow();
  });

  it('is unconfigured without a secret', async () => {
    const unconfigured = buildDemoSessionSigner({});
    expect(unconfigured.isConfigured()).toBe(false);
    await expect(unconfigured.mint({ sub: 'p', tenant: 't' })).rejects.toThrow(/not configured/);
  });
});
