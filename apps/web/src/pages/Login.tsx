import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, Link } from "react-router-dom";
import { TextField } from "../components/ui/TextField";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { BrandPanel } from "../components/BrandPanel";
import { credentialsSchema, tenantRoleLabels, type CredentialsFormValues } from "../lib/validation";
import { ApiError, verifyClinics, type ClinicOption } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

const GLOBAL_OPTION = "__global__";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<"credentials" | "pick-clinic">("credentials");
  const [serverError, setServerError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [pendingCredentials, setPendingCredentials] = useState<CredentialsFormValues | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CredentialsFormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  const finishLogin = async (credentials: CredentialsFormValues, clinic?: ClinicOption) => {
    try {
      await login(
        { ...credentials, clinicId: clinic?.clinicId },
        clinic ? { clinicName: clinic.clinicName, displayName: clinic.displayName, role: clinic.role } : undefined,
      );
      navigate("/");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión. Intenta nuevamente.");
      setStep("credentials");
    }
  };

  const onSubmitCredentials = async (values: CredentialsFormValues) => {
    setServerError(null);
    setVerifying(true);
    try {
      const result = await verifyClinics(values);
      if (result.clinics.length === 0 && !result.isSystemAdmin) {
        setServerError("Tu cuenta no tiene clínicas activas asociadas. Contacta a tu administrador.");
        return;
      }
      if (result.clinics.length === 1 && !result.isSystemAdmin) {
        await finishLogin(values, result.clinics[0]);
        return;
      }
      if (result.clinics.length === 0 && result.isSystemAdmin) {
        await finishLogin(values);
        return;
      }
      // Más de una opción: la cuenta tiene varias clínicas y/o acceso global.
      setClinics(result.clinics);
      setIsSystemAdmin(result.isSystemAdmin);
      setPendingCredentials(values);
      setSelected(result.isSystemAdmin ? GLOBAL_OPTION : result.clinics[0].clinicId);
      setStep("pick-clinic");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión. Intenta nuevamente.");
    } finally {
      setVerifying(false);
    }
  };

  const onConfirmClinic = async () => {
    if (!pendingCredentials) return;
    if (selected === GLOBAL_OPTION) {
      await finishLogin(pendingCredentials);
      return;
    }
    const clinic = clinics.find((c) => c.clinicId === selected);
    await finishLogin(pendingCredentials, clinic);
  };

  return (
    <main className="login-page">
      <BrandPanel />

      <div className="login-form-side">
        <div className="login-form-wrap">
          {step === "credentials" ? (
            <>
              <h1>Inicia sesión</h1>
              <p className="auth-sub">Accede con tu correo y contraseña.</p>

              {serverError ? <FormBanner tone="error">{serverError}</FormBanner> : null}

              <form onSubmit={handleSubmit(onSubmitCredentials)} noValidate>
                <TextField
                  label="Correo electrónico"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="nombre@clinica.cl"
                  error={errors.email?.message}
                  {...register("email")}
                />
                <TextField
                  label="Contraseña"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  error={errors.password?.message}
                  {...register("password")}
                />
                <Button type="submit" loading={verifying}>
                  Continuar
                </Button>
              </form>

              <p className="auth-foot">
                ¿No tienes cuenta? <Link to="/registro">Regístrate aquí</Link>
              </p>
            </>
          ) : (
            <>
              <h1>Elige tu clínica</h1>
              <p className="auth-sub">Tu cuenta tiene acceso a más de un espacio. Elige con cuál quieres trabajar ahora.</p>

              {serverError ? <FormBanner tone="error">{serverError}</FormBanner> : null}

              <div className="clinic-options" role="radiogroup" aria-label="Clínica">
                {clinics.map((c) => (
                  <label key={c.clinicId} className={`clinic-option${selected === c.clinicId ? " selected" : ""}`}>
                    <input
                      type="radio"
                      name="clinic"
                      value={c.clinicId}
                      checked={selected === c.clinicId}
                      onChange={() => setSelected(c.clinicId)}
                    />
                    <span className="clinic-option-name">{c.clinicName}</span>
                    <span className="clinic-option-role">{tenantRoleLabels[c.role]}</span>
                  </label>
                ))}
                {isSystemAdmin ? (
                  <label className={`clinic-option${selected === GLOBAL_OPTION ? " selected" : ""}`}>
                    <input
                      type="radio"
                      name="clinic"
                      value={GLOBAL_OPTION}
                      checked={selected === GLOBAL_OPTION}
                      onChange={() => setSelected(GLOBAL_OPTION)}
                    />
                    <span className="clinic-option-name">Administración global</span>
                    <span className="clinic-option-role">Superadmin</span>
                  </label>
                ) : null}
              </div>

              <Button type="button" onClick={onConfirmClinic}>
                Entrar
              </Button>
              <button
                type="button"
                className="link-button login-back"
                onClick={() => {
                  setStep("credentials");
                  setServerError(null);
                }}
              >
                ← Volver
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
