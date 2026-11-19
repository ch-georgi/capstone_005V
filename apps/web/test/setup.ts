import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { webcrypto } from "node:crypto";

// jsdom's File predates Blob.arrayBuffer; retain its File identity for user-event.
if (typeof window !== "undefined") Object.defineProperty(globalThis.crypto, "subtle", { configurable: true, value: webcrypto.subtle });
if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function () {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(this);
  });
};
afterEach(cleanup);
