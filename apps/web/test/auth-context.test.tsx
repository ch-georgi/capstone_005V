import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import * as api from "../src/lib/api";

const profile = (clinic: string): api.PatientProfile => ({
  patientId: `patient-${clinic}`, user: { id: "user", email: "patient@example.com" }, clinic: { id: clinic, name: clinic },
  displayName: clinic, role: "PATIENT", access: "READ_WRITE", patientRecordPending: false, clinics: [],
});
function Harness() {
  const auth = useAuth();
  return <><output data-testid="session">{JSON.stringify(auth.session)}</output>
    {["A", "B"].map(clinic => <button key={clinic} onClick={() => void auth.login({ email: "patient@example.com", password: "synthetic", clinicId: clinic },
      { gender: "UNSPECIFIED", role: "PATIENT", clinicName: clinic }).catch(() => undefined)}>Login {clinic}</button>)}
    <button onClick={() => void auth.refreshPatientProfile().catch(() => undefined)}>Refresh</button>
    <button onClick={auth.logout}>Logout</button><button onClick={() => auth.setExitWarning("Carga sin confirmar")}>Guard</button></>;
}
beforeEach(() => {
  vi.spyOn(api, "login").mockImplementation(async input => ({
    accessToken: `header.${btoa(JSON.stringify({ sub: "user", clinicId: input.clinicId, context: "TENANT" }))}.signature`, expiresIn: 900, tokenType: "Bearer",
  }));
  vi.spyOn(api, "getPatientProfile").mockImplementation(async token => profile(JSON.parse(atob(token.split(".")[1])).clinicId));
});
describe("perfil de paciente en memoria", () => {
  it("ignora un login atrasado de otra clínica", async () => {
    let resolveA!: (value: api.PatientProfile) => void;
    vi.mocked(api.getPatientProfile).mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; }));
    render(<AuthProvider><Harness /></AuthProvider>);
    fireEvent.click(screen.getByText("Login A"));
    await waitFor(() => expect(resolveA).toBeTypeOf("function"));
    fireEvent.click(screen.getByText("Login B"));
    await waitFor(() => expect(screen.getByTestId("session")).toHaveTextContent("patient-B"));
    await act(async () => resolveA(profile("A")));
    expect(screen.getByTestId("session")).not.toHaveTextContent("patient-A");
  });
  it("no restaura datos cuando un refresh termina después de logout", async () => {
    render(<AuthProvider><Harness /></AuthProvider>);
    fireEvent.click(screen.getByText("Login A"));
    await waitFor(() => expect(screen.getByTestId("session")).toHaveTextContent("patient-A"));
    let finish!: (value: api.PatientProfile) => void;
    vi.mocked(api.getPatientProfile).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByText("Refresh"));
    fireEvent.click(screen.getByText("Logout"));
    await act(async () => finish(profile("A")));
    expect(screen.getByTestId("session")).toHaveTextContent("null");
  });
  it("advierte antes del logout si existe una carga incierta", async () => {
    render(<AuthProvider><Harness /></AuthProvider>);
    fireEvent.click(screen.getByText("Login A"));
    await waitFor(() => expect(screen.getByTestId("session")).toHaveTextContent("patient-A"));
    fireEvent.click(screen.getByText("Guard"));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByText("Logout"));
    expect(screen.getByTestId("session")).toHaveTextContent("patient-A");
    fireEvent.click(screen.getByText("Logout"));
    expect(screen.getByTestId("session")).toHaveTextContent("null");
    expect(confirm).toHaveBeenCalledWith("Carga sin confirmar");
  });
});
