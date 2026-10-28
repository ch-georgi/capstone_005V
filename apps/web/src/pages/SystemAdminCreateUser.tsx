import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "../components/ui/Card";
import { TextField } from "../components/ui/TextField";
import { SelectField } from "../components/ui/SelectField";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { PasswordStrengthMeter } from "../components/ui/PasswordStrength";
import { createUserSchema, genderLabels, genders, tenantRoleLabels, tenantRoles, type CreateUserFormValues } from "../lib/validation";
import { ApiError, createUserInClinic, listClinics, type Clinic } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import "./AuthCard.css";

const roleOptions = tenantRoles.map((value) => ({ value, label: tenantRoleLabels[value] }));
const genderOptions = genders.map((value) => ({ value, label: genderLabels[value] }));

/** Igual que CreateUser, pero para el superadmin global: primero elige la clínica destino. */
export function SystemAdminCreateUser() {
  const { session } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: "", password: "", displayName: "", role: "CLINIC_ADMIN", gender: "UNSPECIFIED" },
  });

  const password = watch("password");

  useEffect(() => {
    if (!session) return;
    listClinics(session.accessToken)
      .then((page) => {
        setClinics(page.items);
        if (page.items.length > 0) setClinicId(page.items[0].id);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [session]);

  const onSubmit = async (values: CreateUserFormValues) => {
    setServerError(null);
    setSuccessEmail(null);
    if (!session) {
      setServerError("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }
    if (!clinicId) {
      setServerError("Elige una clínica destino.");
      return;
    }
    try {
      const created = await createUserInClinic(values, clinicId, session.accessToken);
      setSuccessEmail(created.email);
      reset();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "EMAIL_DUPLICATE") setServerError("Ese correo ya está registrado en el sistema.");
        else if (err.status === 403) setServerError("Tu cuenta no tiene permisos de superadmin para esta acción.");
        else if (err.status === 401) setServerError("Tu sesión expiró. Vuelve a iniciar sesión.");
        else setServerError(err.message);
      } else {
        setServerError("No se pudo crear el usuario. Intenta nuevamente.");
      }
    }
  };

  return (
    <main className="auth-page container">
      <Card className="auth-card">
        <h1>Crear usuario (superadmin)</h1>
        <p className="auth-sub">
          Como administración global, puedes crear una cuenta en cualquier clínica activa.
        </p>

        {loadError ? <FormBanner tone="error">{loadError}</FormBanner> : null}
        {serverError ? <FormBanner tone="error">{serverError}</FormBanner> : null}
        {successEmail ? (
          <FormBanner tone="success">Usuario {successEmail} creado correctamente.</FormBanner>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <SelectField
            label="Clínica destino"
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value)}
            options={
              clinics.length
                ? clinics.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))
                : [{ value: "", label: "Cargando clínicas…" }]
            }
          />
          <TextField
            label="Nombre para mostrar"
            type="text"
            autoComplete="name"
            maxLength={100}
            placeholder="Ej: Dra. Paula Reyes"
            error={errors.displayName?.message}
            {...register("displayName")}
          />
          <TextField
            label="Correo electrónico"
            type="email"
            autoComplete="off"
            maxLength={254}
            placeholder="nombre@clinica.cl"
            error={errors.email?.message}
            {...register("email")}
          />
          <TextField
            label="Contraseña temporal"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            hint="Mínimo 12 caracteres. La persona podrá cambiarla luego de ingresar."
            error={errors.password?.message}
            {...register("password")}
          />
          <PasswordStrengthMeter value={password} />
          <SelectField
            label="Rol en la clínica"
            options={roleOptions}
            error={errors.role?.message}
            {...register("role")}
          />
          <SelectField
            label="Género"
            options={genderOptions}
            error={errors.gender?.message}
            {...register("gender")}
          />

          <Button type="submit" loading={isSubmitting}>
            Crear usuario
          </Button>
        </form>
      </Card>
    </main>
  );
}
