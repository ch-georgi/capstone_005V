import Carousel from "react-bootstrap/Carousel";
import { useAuth } from "../context/AuthContext";
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
          {session?.clinicName ? (
            <>
              Bienvenido/a, <span className="welcome-clinic">{session.clinicName}</span>
            </>
          ) : (
            "Bienvenido/a a WellQ"
          )}
        </h1>
        <p className="welcome-lede">
          Gestiona el historial documental de tus pacientes de forma segura y auditable.
        </p>
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
