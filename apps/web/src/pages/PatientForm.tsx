import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { TextField } from "../components/ui/TextField";
import { SelectField } from "../components/ui/SelectField";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { ApiError, createPatient, getPatient, listMembers, updatePatient, type Member } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import "./Clinical.css";

type Values = { userId: string; firstName: string; lastName: string; dateOfBirth: string; email: string; phone: string; medicalRecordNumber: string };
const EMPTY: Values = { userId: "", firstName: "", lastName: "", dateOfBirth: "", email: "", phone: "", medicalRecordNumber: "" };

/** Crea (/pacientes/nuevo) o edita (/pacientes/:id/editar) la ficha de un paciente. */
export function PatientForm() {
  const { patientId } = useParams();
  const editing = Boolean(patientId);
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const navigate = useNavigate();
  const [values, setValues] = useState<Values>(EMPTY);
  const [accounts, setAccounts] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing && patientId) {
      getPatient(token, patientId)
        .then((p) => setValues({ userId: p.userId, firstName: p.firstName, lastName: p.lastName, dateOfBirth: p.dateOfBirth,
          email: p.email ?? "", phone: p.phone ?? "", medicalRecordNumber: p.medicalRecordNumber ?? "" }))
        .catch((e: Error) => setError(e.message));
    } else {
      // Solo cuentas PATIENT activas que todavía no tienen ficha.
      listMembers(token, { role: "PATIENT", isActive: true, limit: 100 })
        .then((page) => setAccounts(page.items.filter((m) => m.patientId === null)))
        .catch((e: Error) => setError(e.message));
    }
  }, [editing, patientId, token]);

  const set = (key: keyof Values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const validate = (): boolean => {
    const next: Partial<Record<keyof Values, string>> = {};
    if (!editing && !values.userId) next.userId = "Elige la cuenta del paciente.";
    if (!values.firstName.trim()) next.firstName = "Ingresa el nombre.";
    if (!values.lastName.trim()) next.lastName = "Ingresa el apellido.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth)) next.dateOfBirth = "Ingresa la fecha de nacimiento.";
    else if (values.dateOfBirth > new Date().toISOString().slice(0, 10)) next.dateOfBirth = "La fecha no puede ser futura.";
    if (values.email && !/^\S+@\S+\.\S+$/.test(values.email)) next.email = "Correo no válido.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setSaving(true);
    const body = {
      firstName: values.firstName, lastName: values.lastName, dateOfBirth: values.dateOfBirth,
      email: values.email, phone: values.phone, medicalRecordNumber: values.medicalRecordNumber,
    };
    try {
      const saved = editing && patientId
        ? await updatePatient(token, patientId, body)
        : await createPatient(token, { ...body, userId: values.userId });
      navigate(`/pacientes/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError("Ese número de ficha o esa cuenta ya está en uso.");
      else if (err instanceof ApiError && err.status === 403) setError("Tu cuenta no tiene permiso para modificar pacientes.");
      else setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="container clinical narrow">
      <div className="clinical-head">
        <h1>{editing ? "Editar paciente" : "Nuevo paciente"}</h1>
        <Link to={editing ? `/pacientes/${patientId}` : "/pacientes"} className="btn btn-ghost">Cancelar</Link>
      </div>
      <Card>
        <form onSubmit={onSubmit} noValidate className="stack">
          {error ? <FormBanner tone="error">{error}</FormBanner> : null}
          {!editing ? (
            <SelectField
              label="Cuenta del paciente" value={values.userId} onChange={set("userId")} error={errors.userId}
              options={[{ value: "", label: accounts.length ? "Selecciona una cuenta…" : "No hay cuentas de paciente sin ficha" },
                ...accounts.map((a) => ({ value: a.id, label: `${a.displayName}${a.email ? ` · ${a.email}` : ""}` }))]}
            />
          ) : null}
          <TextField label="Nombre" value={values.firstName} onChange={set("firstName")} error={errors.firstName} />
          <TextField label="Apellido" value={values.lastName} onChange={set("lastName")} error={errors.lastName} />
          <TextField label="Fecha de nacimiento" type="date" value={values.dateOfBirth} onChange={set("dateOfBirth")} error={errors.dateOfBirth} />
          <TextField label="Correo de contacto (opcional)" type="email" value={values.email} onChange={set("email")} error={errors.email} />
          <TextField label="Teléfono (opcional)" value={values.phone} onChange={set("phone")} />
          <TextField label="N° de ficha (opcional)" value={values.medicalRecordNumber} onChange={set("medicalRecordNumber")} />
          <Button type="submit" loading={saving}>{editing ? "Guardar cambios" : "Crear paciente"}</Button>
        </form>
      </Card>
    </main>
  );
}
