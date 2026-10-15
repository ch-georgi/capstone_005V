import { useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../src/auth/context";
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
export default function Login() {
  const { manager } = useAuth();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit() {
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
      setError("Ingresa un correo válido y tu contraseña.");
      return;
    }
    setBusy(true);
    try {
      await manager.login(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos iniciar sesión.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Logo />
      <Badge>Tus documentos, más cerca</Badge>
      <Heading>Bienvenido a WellQ</Heading>
      <Copy muted>
        Accede a tu espacio de paciente y mantente conectado con tu clínica.
      </Copy>
      <Field
        label="Correo electrónico"
        value={email}
        onChangeText={setEmail}
        placeholder="tu@correo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        maxLength={254}
        editable={!busy}
      />
      <Field
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        placeholder="Tu contraseña"
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        maxLength={128}
        editable={!busy}
        onSubmitEditing={() => void submit()}
      />
      <Link
        title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        onPress={() => setVisible(!visible)}
      />
      <ErrorMessage message={error} />
      <Button
        title="Iniciar sesión"
        busy={busy}
        onPress={() => void submit()}
      />
      <Link
        title="Olvidé mi contraseña"
        onPress={() => router.push("/recovery")}
      />
      <Link
        title="¿No tienes cuenta? Solicita acceso a tu clínica"
        onPress={() =>
          Alert.alert(
            "Solicita tu acceso",
            "Tu clínica crea tu cuenta y la vincula a tu ficha. Contacta a su equipo para recibir tus credenciales.",
          )
        }
      />
    </Screen>
  );
}
