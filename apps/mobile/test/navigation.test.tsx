import React from "react";
import { renderRouter, screen } from "expo-router/testing-library";
import TabLayout from "../app/(tabs)/_layout";
import Account from "../app/(tabs)/account";
import Layout from "../app/_layout";
import Login from "../app/login";
import Welcome from "../app/(tabs)/index";
import Clinics from "../app/clinics";
import Recovery from "../app/recovery";
import { useAuth } from "../src/auth/context";
jest.mock("../src/auth/context", () => ({
  useAuth: jest.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("expo-font", () => ({
  useFonts: () => [true, null],
  Poppins_400Regular: 1,
  Poppins_500Medium: 1,
  Poppins_600SemiBold: 1,
  Poppins_700Bold: 1,
}));
const routes = {
  _layout: Layout,
  "(tabs)/_layout": TabLayout,
  "(tabs)/index": Welcome,
  "(tabs)/account": Account,
  "(tabs)/exams": () => null,
  login: Login,
  clinics: Clinics,
  recovery: Recovery,
  upload: () => null, pending: () => null, offline: () => null, "document/[examId]/[versionId]": () => null,
};
it("redirects a protected welcome deep link to login without a session", async () => {
  (useAuth as jest.Mock).mockReturnValue({
    manager: {},
    status: "anonymous",
    profile: null,
    offline: false,
    clinics: [],
  });
  const navigation = renderRouter(routes, { initialUrl: "/" });
  await navigation;
  expect(navigation.getPathname()).toBe("/login");
});
it("redirects login to welcome when the session has already been restored", async () => {
  (useAuth as jest.Mock).mockReturnValue({
    manager: {},
    status: "authenticated",
    profile: {
      displayName: "Paciente",
      user: { email: "demo@example.com" },
      clinic: { name: "Clínica A" },
      access: "READ_ONLY",
    },
    offline: false,
    clinics: [],
  });
  const navigation = renderRouter(routes, { initialUrl: "/login" });
  await navigation;
  expect(navigation.getPathname()).toBe("/");
});
it("requires clinic selection before opening the welcome screen", async () => {
  (useAuth as jest.Mock).mockReturnValue({
    manager: {},
    status: "selection",
    profile: null,
    offline: false,
    clinics: [],
  });
  const navigation = renderRouter(routes, { initialUrl: "/" });
  await navigation;
  expect(navigation.getPathname()).toBe("/clinics");
});
