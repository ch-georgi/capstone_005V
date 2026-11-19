// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { twoPagePdf } from "./fixtures";

describe("PDF.js empaquetado", () => {
  it("abre y dibuja un PDF real de dos páginas sin CDN", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: twoPagePdf(), useSystemFonts: true });
    try {
      const document = await task.promise;
      expect(document.numPages).toBe(2);
      for (const pageNumber of [1, 2]) {
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const canvas = createCanvas(viewport.width, viewport.height);
        await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
        const content = await page.getTextContent();
        expect(content.items.some(item => "str" in item && item.str.includes(`page ${pageNumber}`))).toBe(true);
        expect(canvas.toBuffer("image/png").length).toBeGreaterThan(100);
      }
    } finally { await task.destroy(); }
  });
});
