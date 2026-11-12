import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "../components/ui/Card";
import { TextField } from "../components/ui/TextField";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { createClinicSchema, type CreateClinicFormValues } from "../lib/validation";
import { ApiError, createClinic, type Clinic } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import "./AuthCard.css";

export function CreateClinic() {
  const { session } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<Clinic | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateClinicFormValues>({
    resolver: zodResolver(createClinicSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = async (values: CreateClinicFormValues) => {
    setServerError(null);
    setCreated(null);
    if (!session) {
      setServerError("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }
    try {
      const clinic = await createClinic(values, session.accessToken);
      setCreated(clinic);
      reset();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) setServerError("Tu cuenta no tiene permisos de superadmin para esta acción.");
        else if (err.status === 401) setServerError("Tu sesión expiró. Vuelve a iniciar sesión.");
        else setServerError(err.message);
      } else {
        setServerError("No se pudo crear la clínica. Intenta nuevamente.");
      }
    }
  };

  return (
    <main className="auth-page container">
      <Card className="auth-card">
        <h1>Crear clínica</h1>
        <p className="auth-sub">
          Da de alta una nueva clínica. Queda activa de inmediato y disponible para crear usuarios en ella.
        </p>

        {serverError ? <FormBanner tone="error">{serverError}</FormBanner> : null}
        {created ? (
          <FormBanner tone="success">
            Clínica «{created.name}» creada (código: {created.code}).
          </FormBanner>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <TextField
            label="Nombre de la clínica"
            type="text"
            maxLength={100}
            placeholder="Ej: Clínica Esperanza"
            error={errors.name?.message}
            {...register("name")}
          />

          <Button type="submit" loading={isSubmitting}>
            Crear clínica
          </Button>
        </form>
      </Card>
    </main>
  );
}
