import { signRequest, sha256Hex, encodeRfc3986 } from '../../src/modules/storage/adapters/sigv4';

// Vectores oficiales de la documentación de AWS ("Signature Calculations for the Authorization Header").
const credentials = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' };
const date = new Date('2013-05-24T00:00:00Z');

describe('SigV4 signer', () => {
  it('matches the AWS GET Object example (with Range header)', () => {
    const headers = signRequest({
      method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      headers: { range: 'bytes=0-9' }, payloadHash: sha256Hex(''), date,
    }, credentials);
    expect(headers.authorization).toContain('Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request');
    expect(headers.authorization).toContain('SignedHeaders=host;range;x-amz-content-sha256;x-amz-date');
    expect(headers.authorization).toContain('Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  });

  it('matches the AWS PUT Object example (encoded path, storage class, date header)', () => {
    const headers = signRequest({
      method: 'PUT', url: new URL(`https://examplebucket.s3.amazonaws.com/${encodeRfc3986('test$file.text')}`),
      headers: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
      payloadHash: sha256Hex('Welcome to Amazon S3.'), date,
    }, credentials);
    expect(headers.authorization).toContain('SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class');
    expect(headers.authorization).toContain('Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');
  });

  it('encodes RFC 3986 reserved characters and rejects query strings', () => {
    expect(encodeRfc3986("a b!'()*/ñ")).toBe('a%20b%21%27%28%29%2A%2F%C3%B1');
    expect(() => signRequest({ method: 'GET', url: new URL('http://x/y?z=1'), headers: {}, payloadHash: sha256Hex(''), date }, credentials)).toThrow('query');
  });
});
