import { SessionManager } from "../src/auth/session";
import { Api, ApiError, Session, Storage } from "../src/auth/types";
const makeSession = (suffix = "a"): Session => ({
  accessToken: `access-${suffix}`,
  refreshToken: `refresh-${suffix}`,
  tokenType: "Bearer",
  expiresIn: 900,
  sessionExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  profile: {
    user: { id: "patient", email: "patient@example.com" },
    clinic: { id: suffix, name: `Clínica ${suffix}` },
    displayName: "Paciente",
    role: "PATIENT",
    access: "READ_ONLY",
    patientRecordPending: true,
    clinics: [
      {
        id: suffix,
        name: "Clínica",
        displayName: "Paciente",
        access: "READ_ONLY",
        patientRecordPending: true,
      },
    ],
  },
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function setup() {
  const data = new Map<string, string>();
  const storage: Storage = {
    getItem: jest.fn(async (key) => data.get(key) ?? null),
    setItem: jest.fn(async (key, value) => {
      data.set(key, value);
    }),
    deleteItem: jest.fn(async (key) => {
      data.delete(key);
    }),
  };
  const request = jest.fn().mockResolvedValue(undefined);
  const api = { request } as Api;
  return {
    data,
    storage,
    request,
    manager: new SessionManager(api, storage),
    api,
  };
}
async function loggedIn() {
  const state = setup();
  state.request.mockResolvedValueOnce({
    status: "AUTHENTICATED",
    session: makeSession(),
  });
  await state.manager.login(" PATIENT@EXAMPLE.COM ", " Password with spaces ");
  return state;
}
describe("Persistent mobile session lifecycle", () => {
  it("normalizes email but never saves passwords or the access token", async () => {
    const s = await loggedIn();
    expect(s.request).toHaveBeenCalledWith("/auth/mobile/login", {
      email: "patient@example.com",
      password: " Password with spaces ",
    });
    expect([...s.data.values()][0]).not.toContain("Password with spaces");
    expect([...s.data.values()][0]).not.toContain("access-a");
    expect(s.manager.getSnapshot().status).toBe("authenticated");
  });
  it("restores by rotating the saved refresh token without prompting for credentials", async () => {
    const s = await loggedIn();
    s.request.mockResolvedValueOnce(makeSession("b"));
    const reopened = new SessionManager(s.api, s.storage);
    await reopened.restore();
    expect(s.request).toHaveBeenLastCalledWith("/auth/refresh", {
      refreshToken: "refresh-a",
    });
    expect(reopened.getSnapshot().profile?.clinic.id).toBe("b");
    expect([...s.data.values()][0]).toContain("refresh-b");
  });
  it.each([0, 408, 429, 500, 503])(
    "keeps saved credentials during a transient failure (%s)",
    async (status) => {
      const s = await loggedIn();
      s.request.mockRejectedValueOnce(
        new ApiError(status, "NETWORK_ERROR", "offline"),
      );
      const reopened = new SessionManager(s.api, s.storage);
      await reopened.restore();
      expect(reopened.getSnapshot()).toMatchObject({
        status: "authenticated",
        offline: true,
        clinics: [],
      });
      expect(s.data.size).toBe(1);
      s.request.mockResolvedValueOnce(makeSession());
      await reopened.revalidate();
      expect(reopened.getSnapshot().offline).toBe(false);
    },
  );
  it("clears a revoked session and an expired absolute deadline", async () => {
    const s = await loggedIn();
    s.request.mockRejectedValueOnce(
      new ApiError(401, "UNAUTHORIZED", "revoked"),
    );
    await new SessionManager(s.api, s.storage).restore();
    expect(s.data.size).toBe(0);
    const expired = makeSession();
    expired.sessionExpiresAt = new Date(Date.now() - 1000).toISOString();
    s.data.set("wellq.session.v1", JSON.stringify(expired));
    const manager = new SessionManager(s.api, s.storage);
    await manager.restore();
    expect(manager.getSnapshot().status).toBe("anonymous");
    expect(s.data.size).toBe(0);
  });
  it("shares one in-flight refresh across concurrent callers", async () => {
    const s = await loggedIn(),
      pending = deferred<Session>();
    s.request.mockReturnValueOnce(pending.promise);
    const a = s.manager.refresh(),
      b = s.manager.refresh();
    expect(a).toBe(b);
    pending.resolve(makeSession("b"));
    await Promise.all([a, b]);
    expect(
      s.request.mock.calls.filter((call) => call[0] === "/auth/refresh"),
    ).toHaveLength(1);
  });
  it("logs out locally even when remote revocation is offline", async () => {
    const s = await loggedIn();
    s.request.mockRejectedValueOnce(
      new ApiError(0, "NETWORK_ERROR", "offline"),
    );
    await s.manager.logout();
    expect(s.manager.getSnapshot().status).toBe("anonymous");
    expect(s.data.size).toBe(0);
    expect(s.request).toHaveBeenLastCalledWith("/auth/logout", {
      refreshToken: "refresh-a",
    });
  });
  it("never restores credentials after logout when a refresh response arrives late", async () => {
    const s = await loggedIn(),
      pending = deferred<Session>();
    s.request.mockReturnValueOnce(pending.promise);
    const refresh = s.manager.refresh();
    await s.manager.logout();
    pending.resolve(makeSession("b"));
    await refresh;
    expect(s.manager.getSnapshot().status).toBe("anonymous");
    expect(s.data.size).toBe(0);
  });
  it("serializes an in-flight storage write before logout deletion", async () => {
    const s = await loggedIn(),
      write = deferred<void>();
    (s.storage.setItem as jest.Mock).mockImplementationOnce(
      async (key: string, value: string) => {
        await write.promise;
        s.data.set(key, value);
      },
    );
    s.request.mockResolvedValueOnce(makeSession("b"));
    const refresh = s.manager.refresh();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const logout = s.manager.logout();
    write.resolve();
    await Promise.all([refresh, logout]);
    expect(s.data.size).toBe(0);
    expect(s.manager.getSnapshot().status).toBe("anonymous");
  });
  it("keeps the clinic challenge in memory and exchanges it for a session", async () => {
    const s = setup();
    s.request.mockResolvedValueOnce({
      status: "CLINIC_SELECTION_REQUIRED",
      selectionToken: "secret-challenge",
      clinics: makeSession().profile.clinics,
    });
    await s.manager.login("patient@example.com", "password");
    expect(s.manager.getSnapshot().status).toBe("selection");
    expect(s.data.size).toBe(0);
    s.request.mockResolvedValueOnce(makeSession("b"));
    await s.manager.selectClinic("b");
    expect(s.request).toHaveBeenLastCalledWith("/auth/mobile/select-clinic", {
      selectionToken: "secret-challenge",
      clinicId: "b",
    });
    expect(s.manager.getSnapshot().profile?.clinic.id).toBe("b");
  });
  it("does not leak the old profile when changing accounts", async () => {
    const s = await loggedIn();
    s.request.mockRejectedValueOnce(
      new ApiError(401, "INVALID_CREDENTIALS", "wrong"),
    );
    await expect(
      s.manager.login("other@example.com", "wrong"),
    ).rejects.toThrow();
    expect(s.manager.getSnapshot().profile).toBeNull();
    expect(s.data.size).toBe(0);
  });
  it("handles invalid stored data without showing a profile", async () => {
    const s = setup();
    s.data.set("wellq.session.v1", '{"bad":true}');
    await s.manager.restore();
    expect(s.manager.getSnapshot().status).toBe("anonymous");
    expect(s.data.size).toBe(0);
  });
});
