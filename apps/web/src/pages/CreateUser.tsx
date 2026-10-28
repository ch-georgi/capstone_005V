import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "../components/ui/Card";
import { TextField } from "../components/ui/TextField";
import { SelectField } from "../components/ui/SelectField";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { PasswordStrengthMeter } from "../components/ui/PasswordStrength";
import { createUserSchema, tenantRoleLabels, tenantRoles, type CreateUserFormValues } from "../lib/validation";
import { ApiError, createUser } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import "./AuthCard.css";

const roleOptions = tenantRoles.map((value) => ({ value, label: tenantRoleLabels[value] }));

export function CreateUser() {
  const { session } = useAuth();
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
    defaultValues: { email: "", password: "", displayName: "", role: "CLINICIAN" },
  });

  const password = watch("password");

  const onSubmit = async (values: CreateUserFormValues) => {
    setServerError(null);
    setSuccessEmail(null);
    if (!session) {
      setServerError("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }
    try {
      const created = await createUser(values, session.accessToken);
      setSuccessEmail(created.email);
      reset();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "EMAIL_DUPLICATE") {
          setServerError("Ese correo ya está registrado en el sistema.");
        } else if (err.status === 403) {
          setServerError("Tu cuenta no tiene permisos de administrador de clínica para esta acción.");
        } else if (err.status === 401) {
          setServerError("Tu sesión expiró. Vuelve a iniciar sesión.");
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError("No se pudo crear el usuario. Intenta nuevamente.");
      }
    }
  };

  return (
    <main className="auth-page container">
      <Card className="auth-card">
        <h1>Crear usuario de clínica</h1>
        <p className="auth-sub">
          Da de alta una cuenta para un profesional, paciente u otro administrador de tu clínica.
        </p>
        {session?.clinicName ? (
          <p className="create-user-clinic">
            Se creará en <strong>{session.clinicName}</strong> — no se puede elegir otra clínica.
          </p>
        ) : null}

        {serverError ? <FormBanner tone="error">{serverError}</FormBanner> : null}
        {successEmail ? (
          <FormBanner tone="success">Usuario {successEmail} creado correctamente.</FormBanner>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
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

          <Button type="submit" loading={isSubmitting}>
            Crear usuario
          </Button>
        </form>
      </Card>
    </main>
  );
}
