import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { TextField } from "../components/ui/TextField";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { PasswordStrengthMeter } from "../components/ui/PasswordStrength";
import { BrandPanel } from "../components/BrandPanel";
import { registerSchema, type RegisterFormValues } from "../lib/validation";
import { formatRut } from "../lib/rut";
import "../components/ui/Button.css";
import "./Login.css";

export function Register() {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", dni: "", email: "", password: "", confirmPassword: "" },
  });

  const password = watch("password");

  const onSubmit = async () => {
    // El flujo real de activación de cuenta (correo + verificación) está en
    // definición como equipo — por ahora esta vista es solo la maqueta visual.
    await new Promise((r) => setTimeout(r, 400));
    setSubmitted(true);
  };

  return (
    <main className="login-page">
      <BrandPanel />

      <div className="login-form-side">
        <div className="login-form-wrap">
          {submitted ? (
            <>
              <h1>¡Listo!</h1>
              <FormBanner tone="success">
                Registramos tus datos. 
              </FormBanner>
              <Link to="/login" className="btn btn-primary">
                Volver a inicio de sesión
              </Link>
            </>
          ) : (
            <>
              <h1>Crea tu cuenta</h1>
              <p className="auth-sub">
                Completa tus datos
              </p>

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <TextField
                  label="Nombre completo"
                  type="text"
                  autoComplete="name"
                  maxLength={100}
                  placeholder="Ej: María Fernanda Soto"
                  error={errors.fullName?.message}
                  {...register("fullName")}
                />
                <Controller
                  name="dni"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      label="DNI"
                      type="text"
                      autoComplete="off"
                      inputMode="text"
                      maxLength={12}
                      placeholder="12.345.678-5"
                      error={errors.dni?.message}
                      hint="Formato RUT chileno. Lo usaremos para verificar tu identidad junto a tu clínica."
                      {...field}
                      onChange={(e) => field.onChange(e.target.value)}
                      onBlur={(e) => field.onChange(formatRut(e.target.value))}
                    />
                  )}
                />
                <TextField
                  label="Correo electrónico"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="nombre@correo.cl"
                  error={errors.email?.message}
                  {...register("email")}
                />
                <TextField
                  label="Contraseña"
                  type="password"
                  autoComplete="new-password"
                  maxLength={128}
                  error={errors.password?.message}
                  {...register("password")}
                />
                <PasswordStrengthMeter value={password} />
                <TextField
                  label="Confirmar contraseña"
                  type="password"
                  autoComplete="new-password"
                  maxLength={128}
                  error={errors.confirmPassword?.message}
                  {...register("confirmPassword")}
                />

                <Button type="submit" loading={isSubmitting}>
                  Crear cuenta
                </Button>
              </form>

              <p className="auth-foot">
                ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
