import { api } from "../src/auth/api";
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { apiUrl: "https://preview.example.com/api/v1/" } },
  },
}));
const mockFetch = jest.fn();
beforeEach(() => {
  globalThis.fetch = mockFetch;
});
it("uses the API URL embedded in the build configuration and preserves password spaces", async () => {
  mockFetch.mockResolvedValueOnce({
    status: 200,
    ok: true,
    json: async () => ({ status: "AUTHENTICATED" }),
  });
  await api.request("/auth/mobile/login", {
    email: "demo@example.com",
    password: " password ",
  });
  expect(mockFetch).toHaveBeenCalledWith(
    "https://preview.example.com/api/v1/auth/mobile/login",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        email: "demo@example.com",
        password: " password ",
      }),
    }),
  );
});
it("returns structured API errors without exposing raw responses", async () => {
  mockFetch.mockResolvedValueOnce({
    status: 401,
    ok: false,
    json: async () => ({
      code: "INVALID_CREDENTIALS",
      message: "Credenciales incorrectas.",
    }),
  });
  await expect(api.request("/auth/mobile/login", {})).rejects.toMatchObject({
    status: 401,
    code: "INVALID_CREDENTIALS",
  });
});
it("reports a network failure distinctly from an invalid session", async () => {
  mockFetch.mockRejectedValueOnce(new Error("offline"));
  await expect(api.request("/auth/me")).rejects.toMatchObject({
    status: 0,
    code: "NETWORK_ERROR",
  });
});
it("handles no-content responses without trying to parse JSON", async () => {
  const json = jest.fn();
  mockFetch.mockResolvedValueOnce({ status: 204, ok: true, json });
  await expect(
    api.request("/auth/logout", { refreshToken: "synthetic" }),
  ).resolves.toBeUndefined();
  expect(json).not.toHaveBeenCalled();
});
