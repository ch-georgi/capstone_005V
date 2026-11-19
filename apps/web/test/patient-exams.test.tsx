import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, Link, Outlet, RouterProvider } from "react-router-dom";
import { PatientExamLayout } from "../src/components/PatientExamLayout";
import { MyExams } from "../src/pages/MyExams";
import { MyExamDetail } from "../src/pages/MyExamDetail";
import { ExamUpload } from "../src/components/ExamUpload";
import { SideMenu } from "../src/components/SideMenu";
import type { PatientProfile } from "../src/lib/api";

const auth = vi.hoisted(() => ({ session: null as null | { accessToken: string; userId: string; clinicId: string; clinicName: string; role: string; patientProfile: PatientProfile },
  isAuthenticated: true, logout: vi.fn(), refreshPatientProfile: vi.fn(), setExitWarning: vi.fn() }));
vi.mock("../src/context/AuthContext", () => ({ useAuth: () => auth }));
const profile: PatientProfile = { user: { id: "user", email: "patient@example.com" }, clinic: { id: "clinic", name: "Clínica de prueba" },
  patientId: "patient", role: "PATIENT", access: "READ_WRITE", patientRecordPending: false, displayName: "Paciente", clinics: [] };
const version = { id: "version", versionNumber: 1, originalFilename: "examen.pdf", mimeType: "application/pdf", sizeBytes: 20, sha256: "0".repeat(64), createdAt: "2026-11-18T00:00:00Z", uploadedBy: { id: "user", displayName: "Paciente" } };
const exam = { id: "exam", patientId: "patient", title: "Hemograma", examDate: "2026-11-18", examType: { id: "type", code: "HEMO", name: "Laboratorio" },
  professionalName: null, notes: null, latestVersion: version, versionCount: 1, versions: [version], createdAt: "2026-11-18", updatedAt: "2026-11-18" };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const path = (input: unknown) => new URL(String(input)).pathname;
function mount(initial = "/mis-examenes") {
  const router = createMemoryRouter([{ path: "/", element: <PatientExamLayout />, children: [
    { path: "mis-examenes", element: <MyExams /> }, { path: "mis-examenes/:examId", element: <MyExamDetail /> },
    { path: "mis-examenes/:examId/versiones", element: <MyExamDetail history /> },
  ] }, { path: "/login", element: <p>Iniciar sesión</p> }, { path: "*", element: <p>Inicio</p> }], { initialEntries: [initial] });
  render(<RouterProvider router={router} />);
  return router;
}
beforeEach(() => {
  auth.session = { accessToken: "token", userId: "user", clinicId: "clinic", clinicName: "Clínica de prueba", role: "PATIENT", patientProfile: structuredClone(profile) };
  auth.refreshPatientProfile.mockReset().mockImplementation(async () => auth.session?.patientProfile);
  auth.setExitWarning.mockReset();
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    if (path(input).endsWith("/exam-types")) return json({ items: [exam.examType] });
    if (path(input).endsWith("/exams/exam")) return json(exam);
    return json({ items: [exam], total: 21, limit: 20, offset: 0 });
  });
});
describe("Mis exámenes", () => {
  it("reserva las rutas a pacientes autenticados", async () => {
    auth.session = null;
    mount();
    expect(await screen.findByText("Iniciar sesión")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rechaza personal clínico antes de cargar exámenes", async () => {
    auth.session!.role = "CLINICIAN";
    const router = mount();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("identifica una ficha pendiente sin consultar exámenes", async () => {
    auth.session!.patientProfile.patientId = null;
    auth.session!.patientProfile.patientRecordPending = true;
    mount();
    expect(await screen.findByText(/Tu clínica debe completar/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("lista, pagina y conserva filtros al ir al detalle y volver", async () => {
    const user = userEvent.setup(); const router = mount();
    await screen.findByText("Hemograma");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(router.state.location.search).toContain("offset=20"));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-01-01" } });
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    expect(router.state.location.search).toBe("?from=2026-01-01");
    await screen.findByText("Hemograma");
    await user.click(screen.getByRole("link", { name: "Ver detalle" }));
    await screen.findByText("Detalle del examen");
    await user.click(screen.getByRole("link", { name: "Volver a mis exámenes" }));
    await screen.findByText("Hemograma");
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-01-01");
    expect(router.state.location.search).toBe("?from=2026-01-01");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("limit=20"), expect.anything());
  });
  it("no ofrece cargas en solo lectura y actualiza el perfil al recuperar foco", async () => {
    auth.session!.patientProfile.access = "READ_ONLY";
    mount(); await screen.findByText("Hemograma");
    expect(screen.getByText(/Acceso de solo lectura/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subir examen" })).not.toBeInTheDocument();
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(auth.refreshPatientProfile).toHaveBeenCalledTimes(2));
  });
  it("restaura los campos de filtro al retroceder en el historial del navegador", async () => {
    const router = mount();
    await screen.findByText("Hemograma");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() => expect(router.state.location.search).toBe("?from=2026-01-01"));
    await act(async () => { await router.navigate(-1); });
    expect(screen.getByLabelText("Desde")).toHaveValue("");
  });
  it("distingue una lista vacía de una falla de red", async () => {
    vi.mocked(fetch).mockImplementation(async input => path(input).endsWith("/exam-types") ? json({ items: [] }) : json({ items: [], total: 0, limit: 20, offset: 0 }));
    mount();
    expect(await screen.findByText("No hay exámenes para mostrar.")).toBeInTheDocument();
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(await screen.findByRole("button", { name: "Reintentar exámenes" })).toBeInTheDocument();
    expect(screen.queryByText("No hay exámenes para mostrar.")).not.toBeInTheDocument();
  });
  it("ignora respuestas atrasadas después de cambiar filtros", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(async input => {
      if (path(input).endsWith("/exam-types")) return json({ items: [] });
      if (String(input).includes("from=2026")) return json({ items: [{ ...exam, title: "Resultado nuevo" }], total: 1 });
      return new Promise<Response>(resolve => { finish = resolve; });
    });
    mount(); await waitFor(() => expect(finish).toBeTypeOf("function"));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await screen.findByText("Resultado nuevo");
    await act(async () => finish(json({ items: [{ ...exam, title: "Resultado viejo" }], total: 1 })));
    expect(screen.queryByText("Resultado viejo")).not.toBeInTheDocument();
  });
  it("muestra historial, responsable y acciones de cada versión", async () => {
    mount("/mis-examenes/exam/versiones?from=2026-01-01");
    expect(await screen.findByText("Responsable: Paciente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar versión 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al detalle" })).toHaveAttribute("href", "/mis-examenes/exam?from=2026-01-01");
  });
  it("muestra examen no disponible para 404", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ code: "EXAM_NOT_FOUND", message: "missing" }), { status: 404, headers: { "Content-Type": "application/json" } }));
    mount("/mis-examenes/unknown");
    expect(await screen.findByText(/El examen no está disponible/)).toBeInTheDocument();
  });
  it("ofrece Mis exámenes en el menú paciente", () => {
    render(<RouterProvider router={createMemoryRouter([{ path: "/", element: <SideMenu isOpen onClose={() => {}} /> }])} />);
    expect(screen.getByRole("link", { name: "Mis exámenes" })).toHaveAttribute("href", "/mis-examenes");
    expect(screen.queryByRole("link", { name: "Pacientes" })).not.toBeInTheDocument();
  });
});

describe("formulario de carga", () => {
  function form(onDone = vi.fn(), permission = vi.fn()) {
    const router = createMemoryRouter([{ path: "/", element: <><Link to="/other">Salir</Link><Outlet /></>, children: [{ index: true,
      element: <ExamUpload token="token" clinicId="clinic" patientId="patient" examId="exam" examTypes={[]} onDone={onDone} onCancel={vi.fn()} onPermissionDenied={permission} /> },
    { path: "other", element: <p>Otra página</p> }] }]);
    render(<RouterProvider router={router} />); return router;
  }
  it("reintenta con la misma identidad y advierte al abandonar una carga incierta", async () => {
    const user = userEvent.setup(); const onDone = vi.fn(); const router = form(onDone);
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Lost response"));
    await user.upload(screen.getByLabelText(/Archivo/), new File(["%PDF-1.7\nTest"], "test.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Subir" }));
    await screen.findByText(/La carga está sin confirmar/);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(screen.getByRole("link", { name: "Salir" }));
    expect(confirm).toHaveBeenCalled(); expect(router.state.location.pathname).toBe("/");
    const first = JSON.parse((vi.mocked(fetch).mock.calls[0][1]!.body as FormData).get("request") as string);
    vi.mocked(fetch).mockResolvedValue(json({ examId: "exam", versionId: first.payload.versionId, versionNumber: 2, replayed: true }));
    await user.click(screen.getByRole("button", { name: "Reintentar con los mismos datos" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const second = JSON.parse((vi.mocked(fetch).mock.calls[1][1]!.body as FormData).get("request") as string);
    expect(second).toEqual(first);
  });
  it("refresca permisos después de una denegación de escritura", async () => {
    const permission = vi.fn().mockResolvedValue(null); form(vi.fn(), permission);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ code: "FORBIDDEN", message: "Denied" }), { status: 403, headers: { "Content-Type": "application/json" } }));
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Archivo/), new File(["%PDF-1.7\nTest"], "test.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Subir" }));
    await waitFor(() => expect(permission).toHaveBeenCalledOnce());
    expect(screen.getByRole("alert")).toHaveTextContent("permiso de escritura");
  });
});
