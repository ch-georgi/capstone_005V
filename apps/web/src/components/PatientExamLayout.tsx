import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";
import { Button } from "./ui/Button";
import { FormBanner } from "./ui/FormBanner";
import "../pages/Clinical.css";
import "../pages/MyExams.css";

export function PatientExamLayout() {
  const { session, refreshPatientProfile, logout } = useAuth();
  const token = session?.accessToken;
  const [status, setStatus] = useState({ token: "", ready: false, error: "" });
  const request = useRef(0);
  const invalidate = useCallback(() => { request.current++; }, []);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      await refreshPatientProfile();
      if (id === request.current) setStatus({ token: token ?? "", ready: true, error: "" });
    } catch (error) {
      if (id !== request.current) return;
      if (error instanceof ApiError && error.status === 401) { logout(); return; }
      setStatus(previous => ({ token: token ?? "", ready: previous.token === token && previous.ready,
        error: error instanceof Error ? error.message : "No se pudo actualizar tu acceso." }));
    }
  }, [token, refreshPatientProfile, logout]);
  useEffect(() => {
    if (session?.role !== "PATIENT") return;
    let active = true;
    queueMicrotask(() => { if (active) void refresh(); });
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => { active = false; invalidate(); window.removeEventListener("focus", focus); };
  }, [refresh, session?.role, invalidate]);
  if (!session) return <Navigate to="/login" replace />;
  if (session.role !== "PATIENT") return <Navigate to="/" replace />;
  const profile = session.patientProfile;
  return <main className="container clinical my-exams">
    <p className="muted">{session.clinicName}</p>
    {status.error ? <><FormBanner tone="error">{status.error}</FormBanner><Button onClick={() => void refresh()}>Reintentar acceso</Button></> : null}
    {!status.ready || status.token !== token ? (!status.error ? <p role="status">Actualizando tu acceso…</p> : null) : profile?.patientId ? <>
      {profile.access === "READ_ONLY" ? <p className="access-notice" role="status">Acceso de solo lectura. Puedes consultar y descargar tus exámenes.</p> : null}
      <Outlet key={`${session.userId}:${session.clinicId}`} context={{ accessVerified: !status.error }} />
    </> : <><h1>Mis exámenes</h1><p>Tu clínica debe completar tu ficha de paciente para consultar exámenes.</p><Button variant="ghost" onClick={() => void refresh()}>Actualizar ficha</Button></>}
  </main>;
}
