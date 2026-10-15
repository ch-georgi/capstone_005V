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
  Link,
  Logo,
  Screen,
} from "../src/ui";
export default function Clinics() {
  const { manager, status, clinics } = useAuth();
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function choose(id: string) {
    setBusy(id);
    setError("");
    try {
      if (status === "selection") await manager.selectClinic(id);
      else await manager.switchClinic(id);
      router.replace("/");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos seleccionar la clínica.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <Screen>
      <Logo />
      <Badge>Tu espacio de paciente</Badge>
      <Heading>Elige tu clínica</Heading>
      <Copy muted>
        Selecciona con qué clínica deseas continuar. Tus documentos se mantienen
        separados.
      </Copy>
      <ErrorMessage message={error} />
      {clinics.map((clinic) => (
        <Card key={clinic.id}>
          <Copy>{clinic.name}</Copy>
          <Copy muted>
            {clinic.access === "READ_ONLY"
              ? "Acceso de solo lectura"
              : "Acceso a tu espacio de paciente"}
          </Copy>
          <Button
            title="Continuar"
            busy={busy === clinic.id}
            disabled={!!busy}
            onPress={() => void choose(clinic.id)}
          />
        </Card>
      ))}
      <Link
        title={status === "selection" ? "Volver al login" : "Volver al inicio"}
        onPress={() => {
          if (status === "selection") void manager.clear();
          else router.replace("/");
        }}
      />
    </Screen>
  );
}
