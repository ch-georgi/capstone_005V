import { useState } from "react";
import { router } from "expo-router";
import { useAuth } from "../src/auth/context";
import {
  Badge,
  Button,
  Card,
  Copy,
  ErrorMessage,
  Heading,
  Logo,
  Screen,
} from "../src/ui";
export default function Welcome() {
  const { manager, profile, offline, clinics } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!profile) return null;
  async function retry() {
    setBusy(true);
    setError("");
    try {
      await manager.revalidate();
    } catch {
      setError("No pudimos recuperar tu sesión. Vuelve a intentar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Logo />
      <Badge>Tu espacio WellQ</Badge>
      <Heading>Hola, {profile.displayName}</Heading>
      <Copy muted>
        Qué bueno tenerte aquí. Este será tu espacio para consultar y gestionar
        tus documentos médicos.
      </Copy>
      <Card>
        <Badge>Tu clínica</Badge>
        <Copy>{profile.clinic.name}</Copy>
        <Copy muted>{profile.user.email}</Copy>
      </Card>
      {offline ? (
        <Card>
          <Copy>Estás sin conexión</Copy>
          <Copy muted>
            Mostramos la última información guardada. Conéctate para verificar
            tu sesión y tus permisos actuales.
          </Copy>
          <Button
            title="Volver a conectar"
            busy={busy}
            onPress={() => void retry()}
          />
        </Card>
      ) : profile.patientRecordPending ? (
        <Card>
          <Copy>Tu acceso ya está listo</Copy>
          <Copy muted>
            Tu clínica debe completar tu ficha de paciente antes de que puedas
            gestionar documentos.
          </Copy>
        </Card>
      ) : profile.access === "READ_ONLY" ? (
        <Card>
          <Copy>Acceso de solo lectura</Copy>
          <Copy muted>
            Conservas acceso a tu historial permitido. Las nuevas cargas no
            están habilitadas para esta clínica.
          </Copy>
        </Card>
      ) : null}
      <ErrorMessage message={error} />
      {!offline && clinics.length > 1 ? (
        <Button
          title="Cambiar de clínica"
          secondary
          onPress={() => router.push("/clinics")}
        />
      ) : null}
      <Button
        title="Cerrar sesión"
        secondary
        onPress={() => {
          void manager
            .logout()
            .catch(() =>
              setError(
                "No se pudo limpiar la sesión local. Vuelve a intentar.",
              ),
            );
        }}
      />
    </Screen>
  );
}
