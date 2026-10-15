import { createDemoApi, createDemoStorage, DEMO_EMAIL, DEMO_PASSWORD } from "../src/auth/demo";
import { SessionManager } from "../src/auth/session";
import { LoginResult } from "../src/auth/types";

beforeEach(() => { globalThis.fetch = jest.fn(() => { throw new Error("Network is forbidden in demo"); }); });
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); });
it("opens the welcome profile offline with normalized demo credentials and logs out", async () => {
  const manager = new SessionManager(createDemoApi(), createDemoStorage());
  await manager.restore();
  expect(manager.getSnapshot().status).toBe("anonymous");
  await manager.login(` ${DEMO_EMAIL.toUpperCase()} `, DEMO_PASSWORD);
  expect(manager.getSnapshot()).toMatchObject({ status: "authenticated", offline: false, profile: { displayName: "Christopher", clinic: { name: "Clínica WellQ Demo" } } });
  await manager.revalidate();
  await manager.refresh();
  expect(manager.getSnapshot().status).toBe("authenticated");
  await manager.logout();
  expect(manager.getSnapshot()).toMatchObject({ status: "anonymous", profile: null });
});
it("rejects incorrect credentials and preserves password spaces", async () => {
  const manager = new SessionManager(createDemoApi(), createDemoStorage());
  await expect(manager.login(DEMO_EMAIL, "incorrect")).rejects.toMatchObject({ status: 401 });
  await expect(manager.login(DEMO_EMAIL, ` ${DEMO_PASSWORD} `)).rejects.toMatchObject({ status: 401 });
  expect(manager.getSnapshot().status).toBe("anonymous");
});
it("does not reuse sessions when a new demo instance is opened", async () => {
  const first = new SessionManager(createDemoApi(), createDemoStorage());
  await first.login(DEMO_EMAIL, DEMO_PASSWORD);
  const second = new SessionManager(createDemoApi(), createDemoStorage());
  await second.restore();
  expect(second.getSnapshot().status).toBe("anonymous");
});
it("does not send email, reset passwords or route unsupported operations to the network", async () => {
  const api = createDemoApi();
  await expect(api.request("/auth/password/forgot", { email: DEMO_EMAIL })).rejects.toMatchObject({ code: "DEMO_ONLY" });
  await api.request<LoginResult>("/auth/mobile/login", { email: DEMO_EMAIL, password: DEMO_PASSWORD });
  await expect(api.request("/exams")).rejects.toMatchObject({ code: "DEMO_ONLY" });
  await api.request("/auth/logout");
  await expect(api.request("/auth/me", undefined, "demo-access-not-a-jwt")).rejects.toMatchObject({ status: 401 });
});
