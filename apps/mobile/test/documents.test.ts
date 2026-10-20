import { verifyDocument } from "../src/documents/verify";
const { createHash } = require("node:crypto");
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digest: jest.fn(async (_algorithm: string, bytes: ArrayBuffer) => {
    const hash = require("node:crypto").createHash("sha256").update(new Uint8Array(bytes)).digest();
    return new Uint8Array(hash).buffer;
  }),
}));
const bytes = new Uint8Array(Array.from("%PDF-1.7 synthetic test", char => char.charCodeAt(0)));
const metadata = { mimeType: "application/pdf", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
it("accepts a PDF whose MIME, size, signature and hash match", async () => {
  await expect(verifyDocument(bytes, "application/pdf", metadata)).resolves.toBeUndefined();
});
it("rejects mismatching MIME and size before opening a document", async () => {
  await expect(verifyDocument(bytes, "image/png", metadata)).rejects.toThrow(/registro/);
  await expect(verifyDocument(bytes.slice(1), "application/pdf", metadata)).rejects.toThrow(/registro/);
});
it("rejects corrupted bytes despite matching size", async () => {
  const corrupted = bytes.slice(); corrupted[10] ^= 1;
  await expect(verifyDocument(corrupted, "application/pdf", metadata)).rejects.toThrow(/integridad/);
});
it("rejects an invalid signature even when the hash matches", async () => {
  const invalid = new Uint8Array([1, 2, 3]);
  await expect(verifyDocument(invalid, "application/pdf", { ...metadata, sizeBytes: 3, sha256: createHash("sha256").update(invalid).digest("hex") })).rejects.toThrow(/formato/);
});
