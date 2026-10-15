export interface ClinicOption {
  id: string;
  name: string;
  displayName: string;
  access: "READ_ONLY" | "READ_WRITE";
  patientRecordPending: boolean;
}
export interface Profile {
  user: { id: string; email: string };
  clinic: { id: string; name: string };
  displayName: string;
  role: "PATIENT";
  access: "READ_ONLY" | "READ_WRITE";
  patientRecordPending: boolean;
  clinics: ClinicOption[];
}
export interface Session {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  sessionExpiresAt: string;
  profile: Profile;
}
export type LoginResult =
  | { status: "AUTHENTICATED"; session: Session }
  | {
      status: "CLINIC_SELECTION_REQUIRED";
      selectionToken: string;
      clinics: ClinicOption[];
    };
export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}
export interface Api {
  request<T>(
    path: string,
    body?: unknown,
    token?: string,
    method?: string,
  ): Promise<T>;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
