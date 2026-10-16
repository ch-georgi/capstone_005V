import { detectMime, MAX_FILE_BYTES, sha256OfBuffer } from '../../src/modules/storage/file-inspection';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('file inspection', () => {
  it('detects the real type from magic bytes, ignoring names and declared types', () => {
    expect(detectMime(readFileSync(resolve(__dirname, '../../../../database/fixtures/documento-demo.pdf')))).toBe('application/pdf');
    expect(detectMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe('image/jpeg');
    expect(detectMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
  });
  it('rejects executables, scripts, GIF/WebP, truncated signatures and empty buffers', () => {
    expect(detectMime(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(detectMime(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(detectMime(Buffer.from('GIF89a'))).toBeNull();
    expect(detectMime(Buffer.from('%PDF'))).toBeNull();
    expect(detectMime(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(detectMime(Buffer.alloc(0))).toBeNull();
  });
  it('keeps the contract constants and hashes in lowercase hexadecimal', () => {
    expect(MAX_FILE_BYTES).toBe(10_000_000);
    expect(sha256OfBuffer(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
