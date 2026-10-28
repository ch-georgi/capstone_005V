import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import DocumentRoute from "../app/document/[examId]/[versionId]";
import { useAuth } from "../src/auth/context";
import { temporaryDocument, exportDocument } from "../src/documents/files";
jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() }, useLocalSearchParams: () => ({ examId: "exam", versionId: "version" }) }));
jest.mock("../src/auth/context", () => ({ useAuth: jest.fn() }));
jest.mock("../src/documents/files", () => ({ temporaryDocument: jest.fn(), exportDocument: jest.fn() }));
jest.mock("../src/documents/PdfView", () => ({ __esModule: true, default: ({ onError }: { onError: () => void }) => {
  const { Button } = require("react-native"); return <Button title="Simular PDF dañado" onPress={onError} />;
} }));
const request = jest.fn(), file = jest.fn(), remove = jest.fn();
beforeEach(() => {
  request.mockReset(); file.mockReset(); remove.mockReset();
  request.mockResolvedValue({ versions: [{ id: "version", versionNumber: 1, originalFilename: "test.pdf", mimeType: "application/pdf" }] });
  file.mockResolvedValue({ bytes: new Uint8Array([1]), mimeType: "application/pdf" });
  (temporaryDocument as jest.Mock).mockResolvedValue({ uri: "private://test.pdf", base64: async () => "test", remove });
  (exportDocument as jest.Mock).mockResolvedValue(false);
  (useAuth as jest.Mock).mockReturnValue({ manager: { request, file } });
});
it("keeps back and retry available when storage is missing", async () => {
  file.mockRejectedValueOnce(new Error("El archivo no está disponible."));
  await render(<DocumentRoute />);
  expect(await screen.findByText("El archivo no está disponible.")).toBeTruthy();
  expect(screen.getByText("Volver")).toBeTruthy();
  await fireEvent.press(screen.getByText("Reintentar"));
  expect(await screen.findByText("test.pdf · Versión 1")).toBeTruthy();
});
it("handles PDF renderer failures without crashing the route", async () => {
  await render(<DocumentRoute />);
  await fireEvent.press(await screen.findByText("Simular PDF dañado"));
  expect(screen.getByText(/dañado o protegido/)).toBeTruthy();
  expect(screen.getByText("Volver")).toBeTruthy();
});
it("treats cancelling the Android destination picker as a normal result", async () => {
  const view = await render(<DocumentRoute />);
  await fireEvent.press(await screen.findByText("Descargar documento"));
  expect(await screen.findByText("test.pdf · Versión 1")).toBeTruthy();
  expect(screen.queryByText(/No se pudo guardar/)).toBeNull();
  await view.unmount();
  expect(remove).toHaveBeenCalled();
});
