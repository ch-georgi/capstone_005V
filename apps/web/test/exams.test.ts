import { describe, expect, it, vi } from "vitest";
import { ApiError, apiBlob } from "../src/lib/api";
import { prepareUpload, sendPreparedUpload, sha256Hex, validClinicalDate, verifyDocument } from "../src/lib/exams";

const pdf = () => new File(["%PDF-1.7\nDocumento sintético"], "examen.pdf", { type: "application/pdf" });
const fields = { title: "Control", examDate: "2026-11-18", examTypeId: "type" };
describe("contratos de archivos y cargas", () => {
  it("preserva la identidad y los bytes cuando se repite una carga incierta", async () => {
    const file = pdf();
    const upload = await prepareUpload({ clinicId: "clinic", patientId: "patient", file }, fields);
    const payload = upload.request.payload;
    const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Lost response"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ examId: payload.examId, versionId: payload.versionId, versionNumber: 1, replayed: true })));
    await expect(sendPreparedUpload(upload, "token")).rejects.toMatchObject({ status: 0 });
    await expect(sendPreparedUpload(upload, "token")).resolves.toMatchObject({ replayed: true });
    const forms = fetcher.mock.calls.map(call => call[1]!.body as FormData);
    expect(forms[0].get("request")).toBe(forms[1].get("request"));
    expect(await (forms[0].get("file") as File).arrayBuffer()).toEqual(await file.arrayBuffer());
    expect(fetcher.mock.calls[0][1]!.headers).toEqual({ Authorization: "Bearer token" });
  });
  it("no confirma una respuesta inválida ni un resultado de otra operación", async () => {
    const upload = await prepareUpload({ clinicId: "clinic", patientId: "patient", file: pdf() }, fields);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("invalid json"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ examId: "other", versionId: "other", versionNumber: 1, replayed: false })));
    await expect(sendPreparedUpload(upload, "token")).rejects.toMatchObject({ code: "UNCERTAIN_UPLOAD" });
    await expect(sendPreparedUpload(upload, "token")).rejects.toMatchObject({ code: "UNCERTAIN_UPLOAD" });
  });
  it("una versión nueva conserva el examen y omite metadatos", async () => {
    const upload = await prepareUpload({ clinicId: "clinic", patientId: "patient", file: pdf() }, { examId: "existing" });
    expect(upload.request.operation).toBe("UPLOAD_VERSION");
    expect(upload.request.payload).toEqual({ schemaVersion: 1, patientId: "patient", examId: "existing", versionId: expect.any(String) });
  });
  it.each([
    ["application/pdf", new TextEncoder().encode("%PDF-1.7\n")],
    ["image/png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])],
    ["image/jpeg", new Uint8Array([255, 216, 255, 1])],
  ])("verifica integridad para %s", async (mime, bytes) => {
    const blob = new Blob([bytes], { type: mime });
    const version = { mimeType: mime, sizeBytes: blob.size, sha256: await sha256Hex(blob) };
    await expect(verifyDocument(blob, version)).resolves.toBeUndefined();
    await expect(verifyDocument(blob, { ...version, sha256: "0".repeat(64) })).rejects.toThrow("integridad");
    await expect(verifyDocument(blob, { ...version, sizeBytes: 1 })).rejects.toThrow("registro");
  });
  it("rechaza firmas falsas, archivos vacíos y archivos demasiado grandes", async () => {
    for (const file of [new File(["MZ bad"], "fake.pdf", { type: "application/pdf" }), new File([], "empty.pdf", { type: "application/pdf" }),
      new File([new Uint8Array(10_000_001)], "big.pdf", { type: "application/pdf" })]) {
      await expect(prepareUpload({ clinicId: "c", patientId: "p", file }, fields)).rejects.toThrow();
    }
  });
  it("mantiene las fechas clínicas y rechaza fechas imposibles", () => {
    expect(validClinicalDate("2026-11-18")).toBe(true);
    expect(validClinicalDate("2024-02-29")).toBe(true);
    expect(validClinicalDate("2026-02-29")).toBe(false);
    expect(validClinicalDate("2026-11-18T00:00:00Z")).toBe(false);
  });
  it("propaga los errores de almacenamiento sin tratarlos como archivo vacío", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: "STORAGE_UNAVAILABLE", message: "Almacenamiento no disponible" }),
      { status: 503, headers: { "Content-Type": "application/json" } }));
    await expect(apiBlob("/document", "secret")).rejects.toEqual(new ApiError(503, "STORAGE_UNAVAILABLE", "Almacenamiento no disponible"));
  });
});
