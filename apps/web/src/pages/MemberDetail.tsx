import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { TextField } from "../components/ui/TextField";
import { SelectField } from "../components/ui/SelectField";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { ApiError, getMember, updateMember, type Member } from "../lib/api";
import { tenantRoleLabels } from "../lib/validation";
import { useAuth } from "../context/AuthContext";
import "./Clinical.css";

export function MemberDetail() {
  const { userId } = useParams();
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const isSelf = Boolean(userId && session?.userId === userId);

  const [member, setMember] = useState<Member | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"CLINIC_ADMIN" | "CLINICIAN">("CLINICIAN");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getMember(token, userId)
      .then((m) => {
        setMember(m);
        setDisplayName(m.displayName);
        if (m.role !== "PATIENT") setRole(m.role);
        setIsActive(m.isActive);
      })
      .catch((e: Error) => setError(e.message));
  }, [token, userId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const body: { displayName: string; isActive: boolean; role?: "CLINIC_ADMIN" | "CLINICIAN" } = { displayName, isActive };
      if (member?.role !== "PATIENT") body.role = role;
      const saved = await updateMember(token, userId, body);
      setMember(saved);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "SELF_CHANGE_FORBIDDEN") setError("No puedes cambiar tu propio rol ni desactivarte.");
      else if (err instanceof ApiError && err.code === "PATIENT_ROLE_LOCKED") setError("El rol de una cuenta de paciente no se puede cambiar.");
      else if (err instanceof ApiError && err.status === 403) setError("Tu cuenta no tiene permiso para modificar usuarios.");
      else setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  if (error && !member) {
    return (
      <main className="container clinical narrow">
        <FormBanner tone="error">{error}</FormBanner>
        <Link to="/profesionales" className="back-link">← Volver a profesionales</Link>
      </main>
    );
  }
  if (!member) return <main className="container clinical narrow">Cargando…</main>;

  return (
    <main className="container clinical narrow">
      <div className="clinical-head">
        <h1>{member.displayName}</h1>
        <Link to="/profesionales" className="btn btn-ghost">Volver</Link>
      </div>
      <Card>
        <dl className="patient-info" style={{ marginBottom: 20 }}>
          <div><dt>Correo</dt><dd>{member.email ?? "—"}</dd></div>
          <div><dt>Cuenta</dt><dd>{member.hasCredentials ? "Activada" : "Pendiente de activación"}</dd></div>
        </dl>

        {isSelf ? (
          <FormBanner tone="success">Esta es tu propia cuenta: no puedes cambiar tu rol ni desactivarte.</FormBanner>
        ) : null}
        {error ? <FormBanner tone="error">{error}</FormBanner> : null}
        {success ? <FormBanner tone="success">Cambios guardados.</FormBanner> : null}

        <form onSubmit={onSubmit} noValidate className="stack">
          <TextField
            label="Nombre para mostrar"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
          />
          {member.role === "PATIENT" ? (
            <TextField label="Rol" value={tenantRoleLabels.PATIENT} disabled readOnly />
          ) : (
            <SelectField
              label="Rol en la clínica"
              value={role}
              disabled={isSelf}
              onChange={(e) => setRole(e.target.value as "CLINIC_ADMIN" | "CLINICIAN")}
              options={[
                { value: "CLINIC_ADMIN", label: tenantRoleLabels.CLINIC_ADMIN },
                { value: "CLINICIAN", label: tenantRoleLabels.CLINICIAN },
              ]}
            />
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={isActive}
              disabled={isSelf}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Cuenta activa en esta clínica
          </label>
          <Button type="submit" loading={saving}>Guardar cambios</Button>
        </form>
      </Card>
    </main>
  );
}
