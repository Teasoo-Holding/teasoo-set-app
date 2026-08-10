import type { Request } from 'express';
import { extractBearerToken, extractDomain } from './session';

function reqWith(auth?: string): Request {
  return { header: (n: string) => (n.toLowerCase() === 'authorization' ? auth : undefined) } as unknown as Request;
}

describe('extractBearerToken', () => {
  it('reads a bearer token', () => {
    expect(extractBearerToken(reqWith('Bearer abc.def.ghi'))).toBe('abc.def.ghi');
  });

  it('is case-insensitive on the scheme', () => {
    expect(extractBearerToken(reqWith('bearer tok'))).toBe('tok');
  });

  it('ignores non-bearer or missing auth', () => {
    expect(extractBearerToken(reqWith('Basic xyz'))).toBeUndefined();
    expect(extractBearerToken(reqWith(undefined))).toBeUndefined();
  });
});

describe('extractDomain', () => {
  it('lowercases the domain', () => {
    expect(extractDomain('Ada@Acme.COM')).toBe('acme.com');
  });

  it('takes the part after the last @', () => {
    expect(extractDomain('weird@sub@acme.com')).toBe('acme.com');
  });

  it('rejects malformed addresses', () => {
    expect(extractDomain('no-at-sign')).toBeUndefined();
    expect(extractDomain('@acme.com')).toBeUndefined();
    expect(extractDomain('ada@')).toBeUndefined();
  });
});
