import { useEffect, useState } from "react";
import { router } from "expo-router";
import { api } from "../src/auth/api";
import {
  Badge,
  Button,
  Copy,
  ErrorMessage,
  Field,
  Heading,
  Link,
  Logo,
  Screen,
} from "../src/ui";
export default function Recovery() {
  const [step, setStep] = useState<"email" | "code" | "password" | "done">(
      "email",
    ),
    [email, setEmail] = useState(""),
    [challenge, setChallenge] = useState(""),
    [code, setCode] = useState(""),
    [token, setToken] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!seconds) return;
    const timeout = setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => clearTimeout(timeout);
  }, [seconds]);
  async function requestCode() {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
      throw new Error("Ingresa un correo válido.");
    const result = await api.request<{
      challengeId: string;
      resendAfter: number;
    }>("/auth/password/forgot", { email: normalized });
    setChallenge(result.challengeId);
    setCode("");
    setSeconds(result.resendAfter);
    setStep("code");
  }
  async function submit(resend = false) {
    setError("");
    setBusy(true);
    try {
      if (step === "email" || resend) await requestCode();
      else if (step === "code") {
        if (!/^\d{6}$/.test(code))
          throw new Error("Ingresa los seis dígitos del código.");
        const result = await api.request<{ resetToken: string }>(
          "/auth/password/verify",
          { challengeId: challenge, code },
        );
        setToken(result.resetToken);
        setCode("");
        setStep("password");
      } else if (step === "password") {
        if (password.length < 12 || password.length > 128)
          throw new Error(
            "La contraseña debe tener entre 12 y 128 caracteres.",
          );
        if (password !== confirmation)
          throw new Error("Las contraseñas no coinciden.");
        await api.request("/auth/password/reset", {
          resetToken: token,
          password,
        });
        setToken("");
        setPassword("");
        setConfirmation("");
        setStep("done");
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No pudimos completar la recuperación.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Logo />
      <Badge>Recupera tu acceso</Badge>
      <Heading>
        {step === "done" ? "Contraseña actualizada" : "Olvidé mi contraseña"}
      </Heading>
      {step === "email" ? (
        <>
          <Copy muted>
            Ingresa el correo con el que accedes a WellQ. Si existe una cuenta,
            recibirás un código.
          </Copy>
          <Field
            label="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            maxLength={254}
            editable={!busy}
          />
        </>
      ) : step === "code" ? (
        <>
          <Copy muted>
            Si existe una cuenta con ese correo, recibirás un código de seis
            dígitos. Vence en 10 minutos.
          </Copy>
          <Field
            label="Código de recuperación"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={6}
            editable={!busy}
          />
          <Button
            title={seconds ? `Reenviar en ${seconds} s` : "Reenviar código"}
            secondary
            disabled={seconds > 0 || busy}
            onPress={() => void submit(true)}
          />
        </>
      ) : step === "password" ? (
        <>
          <Copy muted>
            Usa entre 12 y 128 caracteres. Al cambiarla, se cerrarán las
            sesiones de tu cuenta en todas las clínicas.
          </Copy>
          <Field
            label="Nueva contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            maxLength={128}
            editable={!busy}
          />
          <Field
            label="Confirmar contraseña"
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry
            autoComplete="new-password"
            maxLength={128}
            editable={!busy}
          />
        </>
      ) : (
        <Copy muted>Ya puedes iniciar sesión con tu nueva contraseña.</Copy>
      )}
      <ErrorMessage message={error} />
      {step !== "done" ? (
        <Button
          title={
            step === "email"
              ? "Enviar código"
              : step === "code"
                ? "Verificar código"
                : "Guardar contraseña"
          }
          busy={busy}
          onPress={() => void submit()}
        />
      ) : null}
      <Link title="Volver al login" onPress={() => router.replace("/login")} />
    </Screen>
  );
}
