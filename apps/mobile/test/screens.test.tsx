import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import Login from "../app/login";
import Welcome from "../app/index";
import Clinics from "../app/clinics";
import Recovery from "../app/recovery";
import { useAuth } from "../src/auth/context";
import { api } from "../src/auth/api";
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock("../src/auth/context", () => ({ useAuth: jest.fn() }));
jest.mock("../src/auth/api", () => ({ api: { request: jest.fn() } }));
const login = jest.fn(),
  logout = jest.fn(),
  selectClinic = jest.fn();
const profile = {
  user: { id: "u", email: "patient@example.com" },
  clinic: { id: "a", name: "Clínica A" },
  displayName: "Paciente de prueba",
  access: "READ_ONLY",
  patientRecordPending: false,
};
beforeEach(() => {
  logout.mockResolvedValue(undefined);
  selectClinic.mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({
    manager: { login, logout, selectClinic },
    status: "anonymous",
    profile: null,
    offline: false,
    clinics: [],
  });
});
it("validates login, preserves password spaces and shows backend errors", async () => {
  await render(<Login />);
  await fireEvent.press(screen.getByText("Iniciar sesión"));
  expect(screen.getByRole("alert")).toHaveTextContent(/correo/);
  login.mockRejectedValueOnce(new Error("Email o contraseña incorrectos."));
  await fireEvent.changeText(
    screen.getByLabelText("Correo electrónico"),
    "patient@example.com",
  );
  await fireEvent.changeText(screen.getByLabelText("Contraseña"), " password ");
  await fireEvent.press(screen.getByText("Iniciar sesión"));
  await waitFor(() =>
    expect(login).toHaveBeenCalledWith("patient@example.com", " password "),
  );
  expect(
    await screen.findByText("Email o contraseña incorrectos."),
  ).toBeTruthy();
  expect(screen.getByLabelText("Contraseña").props.value).toBe("");
});
it("shows the authorized clinic and read-only status without fake exam actions", async () => {
  (useAuth as jest.Mock).mockReturnValue({
    manager: { logout },
    profile,
    offline: false,
    clinics: [],
  });
  await render(<Welcome />);
  expect(screen.getByText("Hola, Paciente de prueba")).toBeTruthy();
  expect(screen.getByText("Clínica A")).toBeTruthy();
  expect(screen.getByText("Acceso de solo lectura")).toBeTruthy();
  expect(screen.queryByText("Mis Exámenes")).toBeNull();
  await fireEvent.press(screen.getByText("Cerrar sesión"));
  expect(logout).toHaveBeenCalled();
});
it("shows offline information without asserting current write permissions", async () => {
  (useAuth as jest.Mock).mockReturnValue({
    manager: {},
    profile: { ...profile, access: "READ_WRITE" },
    offline: true,
    clinics: [],
  });
  await render(<Welcome />);
  expect(screen.getByText("Estás sin conexión")).toBeTruthy();
  expect(screen.queryByText("Cambiar de clínica")).toBeNull();
});
it("only renders the clinic options supplied by the authenticated flow", async () => {
  (useAuth as jest.Mock).mockReturnValue({
    manager: { selectClinic },
    status: "selection",
    clinics: [{ id: "a", name: "Clínica A", access: "READ_ONLY" }],
  });
  await render(<Clinics />);
  await fireEvent.press(screen.getByText("Continuar"));
  await waitFor(() => expect(selectClinic).toHaveBeenCalledWith("a"));
  expect(screen.queryByText("Clínica B")).toBeNull();
});
it("completes the three recovery steps and checks password confirmation", async () => {
  const request = api.request as jest.Mock;
  request
    .mockResolvedValueOnce({ challengeId: "challenge", resendAfter: 60 })
    .mockResolvedValueOnce({ resetToken: "reset-token" })
    .mockResolvedValueOnce(undefined);
  await render(<Recovery />);
  await fireEvent.changeText(
    screen.getByLabelText("Correo electrónico"),
    "patient@example.com",
  );
  await fireEvent.press(screen.getByText("Enviar código"));
  await screen.findByLabelText("Código de recuperación");
  await fireEvent.changeText(
    screen.getByLabelText("Código de recuperación"),
    "123456",
  );
  await fireEvent.press(screen.getByText("Verificar código"));
  await screen.findByLabelText("Nueva contraseña");
  await fireEvent.changeText(
    screen.getByLabelText("Nueva contraseña"),
    "New-password-123",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Confirmar contraseña"),
    "different",
  );
  await fireEvent.press(screen.getByText("Guardar contraseña"));
  expect(await screen.findByText("Las contraseñas no coinciden.")).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText("Confirmar contraseña"),
    "New-password-123",
  );
  await fireEvent.press(screen.getByText("Guardar contraseña"));
  expect(await screen.findByText("Contraseña actualizada")).toBeTruthy();
  expect(request).toHaveBeenLastCalledWith("/auth/password/reset", {
    resetToken: "reset-token",
    password: "New-password-123",
  });
});
