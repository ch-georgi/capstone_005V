import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PdfDocument from "../src/components/PdfDocument";

const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), render: vi.fn(), cleanup: vi.fn(), destroy: vi.fn() }));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: mocks.getDocument }));
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  mocks.render.mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
  mocks.destroy.mockResolvedValue(undefined);
  mocks.getDocument.mockReturnValue({ destroy: mocks.destroy, promise: Promise.resolve({ numPages: 2,
    getPage: vi.fn().mockImplementation(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 300 * scale, height: 400 * scale }), render: mocks.render, cleanup: mocks.cleanup,
    })),
  }) });
});
describe("controles del visor PDF", () => {
  it("cambia páginas, aplica zoom y destruye recursos al salir", async () => {
    const view = render(<PdfDocument blob={new Blob(["%PDF-1.7\n"], { type: "application/pdf" })} />);
    await screen.findByText("Página 1 / 2");
    await waitFor(() => expect(mocks.render).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(screen.getByText("Página 2 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(2));
    const width = screen.getByLabelText("Página 2 del documento PDF").getAttribute("width");
    fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom" }));
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(3));
    expect(Number(screen.getByLabelText("Página 2 del documento PDF").getAttribute("width"))).toBeGreaterThan(Number(width));
    view.unmount(); expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it("muestra un error para un PDF dañado o protegido", async () => {
    mocks.getDocument.mockImplementationOnce(() => ({ promise: Promise.reject(new Error("corrupt")), destroy: mocks.destroy }));
    await act(async () => { render(<PdfDocument blob={new Blob(["%PDF-bad"], { type: "application/pdf" })} />); });
    expect(await screen.findByRole("alert")).toHaveTextContent("dañado o protegido");
  });
});
