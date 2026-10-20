import {
  Api,
  BinaryFile,
  ApiError,
  ClinicOption,
  LoginResult,
  Profile,
  Session,
  Storage,
} from "./types";
const KEY = "wellq.session.v1";
type Saved = {
  refreshToken: string;
  sessionExpiresAt: string;
  profile: Profile;
};
export interface Snapshot {
  status: "loading" | "anonymous" | "selection" | "authenticated";
  profile: Profile | null;
  offline: boolean;
  clinics: ClinicOption[];
}
export class SessionManager {
  private value: Snapshot = {
    status: "loading",
    profile: null,
    offline: false,
    clinics: [],
  };
  private persistence: Promise<void> = Promise.resolve();
  private persist(task: () => Promise<void>) {
    const next = this.persistence.then(task, task);
    this.persistence = next.catch(() => undefined);
    return next;
  }
  private listeners = new Set<() => void>();
  private saved: Saved | null = null;
  private session: Session | null = null;
  private expiresAt = 0;
  private selectionToken: string | null = null;
  private generation = 0;
  private refreshing: Promise<Session> | null = null;
  constructor(
    private api: Api,
    private storage: Storage,
  ) {}
  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(value: Snapshot) {
    this.value = value;
    this.listeners.forEach((listener) => listener());
  }
  private anonymous() {
    this.emit({
      status: "anonymous",
      profile: null,
      offline: false,
      clinics: [],
    });
  }
  private async accept(session: Session, generation: number) {
    if (generation !== this.generation) return;
    // Persist only a minimal profile, never the potentially large clinic directory or a password.
    const saved: Saved = {
      refreshToken: session.refreshToken,
      sessionExpiresAt: session.sessionExpiresAt,
      profile: { ...session.profile, clinics: [] },
    };
    await this.persist(async () => {
      if (generation === this.generation)
        await this.storage.setItem(KEY, JSON.stringify(saved));
    });
    if (generation !== this.generation) return;
    this.saved = saved;
    this.session = session;
    this.expiresAt = Date.now() + session.expiresIn * 1000;
    this.selectionToken = null;
    this.emit({
      status: "authenticated",
      profile: session.profile,
      offline: false,
      clinics: session.profile.clinics,
    });
  }
  async restore() {
    const generation = ++this.generation;
    const raw = await this.storage.getItem(KEY).catch(() => null);
    if (generation !== this.generation) return;
    if (!raw) {
      this.anonymous();
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Saved;
      if (
        typeof parsed.refreshToken !== "string" ||
        parsed.profile?.role !== "PATIENT" ||
        typeof parsed.profile?.displayName !== "string" ||
        typeof parsed.profile?.user?.email !== "string" ||
        typeof parsed.profile?.clinic?.name !== "string" ||
        !parsed.profile?.user?.id ||
        !parsed.profile.clinic?.id ||
        !Number.isFinite(Date.parse(parsed.sessionExpiresAt))
      )
        throw new Error();
      this.saved = parsed;
    } catch {
      await this.clear();
      return;
    }
    if (Date.parse(this.saved!.sessionExpiresAt) <= Date.now()) {
      await this.clear();
      return;
    }
    try {
      await this.refresh();
    } catch (error) {
      if (generation !== this.generation) return;
      if (
        error instanceof ApiError &&
        (error.status === 0 ||
          error.status === 408 ||
          error.status === 429 ||
          error.status >= 500) &&
        this.saved
      ) {
        this.emit({
          status: "authenticated",
          profile: this.saved.profile,
          offline: true,
          clinics: [],
        });
      } else await this.clear();
    }
  }
  async login(email: string, password: string) {
    const generation = ++this.generation;
    this.refreshing = null;
    this.selectionToken = null;
    this.session = null;
    this.saved = null;
    await this.persist(() => this.storage.deleteItem(KEY));
    this.anonymous();
    const result = await this.api.request<LoginResult>("/auth/mobile/login", {
      email: email.trim().toLowerCase(),
      password,
    });
    if (generation !== this.generation) return;
    if (result.status === "AUTHENTICATED")
      await this.accept(result.session, generation);
    else {
      this.selectionToken = result.selectionToken;
      this.emit({
        status: "selection",
        profile: null,
        offline: false,
        clinics: result.clinics,
      });
    }
  }
  async selectClinic(clinicId: string) {
    if (!this.selectionToken)
      throw new ApiError(401, "SELECTION_EXPIRED", "Inicia sesión nuevamente.");
    const generation = this.generation;
    try {
      const result = await this.api.request<Session>(
        "/auth/mobile/select-clinic",
        { selectionToken: this.selectionToken, clinicId },
      );
      await this.accept(result, generation);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await this.clear();
      throw error;
    }
  }
  refresh(): Promise<Session> {
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    const operation = async () => {
      if (!this.saved || Date.parse(this.saved.sessionExpiresAt) <= Date.now())
        throw new ApiError(
          401,
          "SESSION_EXPIRED",
          "Tu sesión venció. Inicia sesión nuevamente.",
        );
      const result = await this.api.request<Session>("/auth/refresh", {
        refreshToken: this.saved.refreshToken,
      });
      await this.accept(result, generation);
      return result;
    };
    const pending = operation()
      .catch(async (error) => {
        if (
          generation === this.generation &&
          error instanceof ApiError &&
          [400, 401, 403].includes(error.status)
        )
          await this.clear();
        throw error;
      })
      .finally(() => {
        if (this.refreshing === pending) this.refreshing = null;
      });
    this.refreshing = pending;
    return pending;
  }
  async revalidate() {
    if (!this.saved) return;
    const generation = this.generation;
    try {
      if (!this.session || this.expiresAt <= Date.now() + 30000) {
        await this.refresh();
        return;
      }
      const profile = await this.api.request<Profile>(
        "/auth/me",
        undefined,
        this.session.accessToken,
      );
      await this.accept(
        {
          ...this.session,
          profile,
          expiresIn: Math.max(
            1,
            Math.floor((this.expiresAt - Date.now()) / 1000),
          ),
        },
        generation,
      );
    } catch (error) {
      if (generation !== this.generation) return;
      if (
        error instanceof ApiError &&
        (error.status === 0 ||
          error.status === 408 ||
          error.status === 429 ||
          error.status >= 500) &&
        this.saved
      )
        this.emit({
          ...this.value,
          status: "authenticated",
          profile: this.saved.profile,
          offline: true,
          clinics: [],
        });
      else if (
        error instanceof ApiError &&
        error.status === 401 &&
        this.session &&
        this.expiresAt > Date.now() + 30000
      ) {
        await this.clear();
      } else await this.clear();
    }
  }
  async switchClinic(clinicId: string) {
    if (!this.session || this.expiresAt <= Date.now() + 30000)
      await this.refresh();
    const generation = ++this.generation;
    const result = await this.api.request<Session>(
      "/auth/mobile/switch-clinic",
      { clinicId },
      this.session!.accessToken,
    );
    await this.accept(result, generation);
  }
  contextKey() { return `${this.generation}:${this.value.profile?.user.id}:${this.value.profile?.clinic.id}`; }
  private async authorized<T>(operation: (token: string) => Promise<T>): Promise<T> {
    const key=this.contextKey();
    const generation=this.generation;
    if(!this.session || this.expiresAt <= Date.now()+30000) await this.refresh();
    if(key!==this.contextKey()) throw new ApiError(409,"CONTEXT_CHANGED","La sesión cambió.");
    const accessToken=this.session!.accessToken;
    try {
      let result: T;
      try { result=await operation(accessToken); }
      catch(error) {
        if(!(error instanceof ApiError) || error.status!==401 || key!==this.contextKey()) throw error;
        if(this.session?.accessToken===accessToken) await this.refresh();
        if(key!==this.contextKey()) throw new ApiError(409,"CONTEXT_CHANGED","La sesión cambió.");
        try { result=await operation(this.session!.accessToken); }
        catch(second) { if(second instanceof ApiError && second.status===401 && generation===this.generation) await this.clear(); throw second; }
      }
      if(key!==this.contextKey()) throw new ApiError(409,"CONTEXT_CHANGED","La sesión cambió.");
      return result;
    } catch(error) { throw error; }
  }
  request<T>(path: string, body?: unknown, method?: string) {
    return this.authorized(token=>this.api.request<T>(path,body,token,method));
  }
  file(path: string): Promise<BinaryFile> {
    return this.authorized(token=>{
      if(!this.api.file) throw new ApiError(400,"DEMO_ONLY","Los documentos requieren conexión real.");
      return this.api.file(path,token);
    });
  }
  async updateName(displayName: string) {
    const generation=this.generation;
    const profile=await this.request<Profile>("/auth/me",{displayName},"PATCH");
    if(this.session && generation===this.generation) await this.accept({...this.session,profile,expiresIn:Math.max(1,Math.floor((this.expiresAt-Date.now())/1000))},generation);
  }
  async clear() {
    ++this.generation;
    this.saved = null;
    this.session = null;
    this.selectionToken = null;
    this.expiresAt = 0;
    this.refreshing = null;
    this.anonymous();
    await this.persist(() => this.storage.deleteItem(KEY));
  }
  async logout() {
    const token = this.saved?.refreshToken;
    await this.clear();
    if (token)
      await this.api
        .request("/auth/logout", { refreshToken: token })
        .catch(() => undefined);
  }
}
