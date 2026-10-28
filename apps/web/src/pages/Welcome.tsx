import { Link } from "react-router-dom";
import Carousel from "react-bootstrap/Carousel";
import { useAuth } from "../context/AuthContext";
import { tenantRoleLabels } from "../lib/validation";
import "./Welcome.css";

const SLIDES = [
  {
    title: "Tu información, solo de tu clínica",
    text: "WellQ es multitenant: cada clínica opera en un espacio aislado. Lo que ve tu equipo nunca se cruza con los datos de otra clínica, ni al revés.",
    tone: "teal",
  },
  {
    title: "Auditoría de cada acceso",
    text: "Cada vista, descarga o cambio sobre un examen queda registrado de forma inmutable — trazabilidad completa para tu equipo clínico.",
    tone: "blue",
  },
  {
    title: "Historial clínico versionado",
    text: "Los documentos médicos nunca se sobrescriben: cada nueva versión se conserva junto a las anteriores, con su propia huella de integridad.",
    tone: "purple",
  },
];

export function Welcome() {
  const { session } = useAuth();

  return (
    <main className="welcome container">
      <div className="welcome-greeting">
        <h1>
          {session?.displayName ? (
            <>Bienvenido/a, <span className="welcome-clinic">{session.displayName}</span></>
          ) : session?.context === "GLOBAL" ? (
            "Bienvenido/a, administración global"
          ) : (
            "Bienvenido/a a WellQ"
          )}
        </h1>
        {session?.clinicName ? (
          <p className="welcome-subtitle">
            {session.clinicName}
            {session.role ? ` · ${tenantRoleLabels[session.role]}` : null}
          </p>
        ) : session?.context === "GLOBAL" ? (
          <p className="welcome-subtitle">Superadmin · todas las clínicas</p>
        ) : null}
        <p className="welcome-lede">
          {session?.context === "GLOBAL"
            ? "Crea cuentas de clínica desde aquí. Las fichas clínicas y la auditoría son privadas de cada clínica."
            : "Gestiona el historial documental de tus pacientes de forma segura y auditable."}
        </p>
        {session?.role === "CLINIC_ADMIN" || session?.role === "CLINICIAN" ? (
          <Link to="/pacientes" className="btn btn-primary">Ir a pacientes</Link>
        ) : session?.context === "GLOBAL" ? (
          <Link to="/admin/crear-usuario" className="btn btn-primary">Crear usuario</Link>
        ) : null}
      </div>

      <Carousel className="welcome-carousel" indicators controls interval={6000}>
        {SLIDES.map((slide) => (
          <Carousel.Item key={slide.title}>
            <div className={`welcome-slide tone-${slide.tone}`}>
              <h2>{slide.title}</h2>
              <p>{slide.text}</p>
            </div>
          </Carousel.Item>
        ))}
      </Carousel>
    </main>
  );
}
