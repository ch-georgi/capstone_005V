import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { Welcome } from "./pages/Welcome";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { CreateUser } from "./pages/CreateUser";
import { Patients } from "./pages/Patients";
import { PatientForm } from "./pages/PatientForm";
import { PatientDetail } from "./pages/PatientDetail";
import { Audit } from "./pages/Audit";
import { Members } from "./pages/Members";
import { MemberDetail } from "./pages/MemberDetail";
import { SystemAdminCreateUser } from "./pages/SystemAdminCreateUser";
import { CreateClinic } from "./pages/CreateClinic";
import { GlobalMembers } from "./pages/GlobalMembers";

export default function App() {
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // "Cerrar sesión" vive dentro del menú: sin esto, al volver a iniciar
  // sesión el menú reaparecería abierto (quedó así la última vez).
  useEffect(() => {
    if (!isAuthenticated) setMenuOpen(false);
  }, [isAuthenticated]);

  return (
    <>
      <AppHeader menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} onCloseMenu={() => setMenuOpen(false)} />
      <div className={`app-content${menuOpen ? " menu-open" : ""}`}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Welcome />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route
            path="/crear-usuario"
            element={
              <ProtectedRoute>
                <CreateUser />
              </ProtectedRoute>
            }
          />
          <Route path="/pacientes" element={<ProtectedRoute><Patients /></ProtectedRoute>} />
          <Route path="/pacientes/nuevo" element={<ProtectedRoute><PatientForm /></ProtectedRoute>} />
          <Route path="/pacientes/:patientId" element={<ProtectedRoute><PatientDetail /></ProtectedRoute>} />
          <Route path="/pacientes/:patientId/editar" element={<ProtectedRoute><PatientForm /></ProtectedRoute>} />
          <Route path="/auditoria" element={<ProtectedRoute><Audit /></ProtectedRoute>} />
          <Route path="/profesionales" element={<ProtectedRoute><Members /></ProtectedRoute>} />
          <Route path="/profesionales/:userId" element={<ProtectedRoute><MemberDetail /></ProtectedRoute>} />
          <Route path="/admin/crear-usuario" element={<ProtectedRoute><SystemAdminCreateUser /></ProtectedRoute>} />
          <Route path="/admin/crear-clinica" element={<ProtectedRoute><CreateClinic /></ProtectedRoute>} />
          <Route path="/admin/usuarios" element={<ProtectedRoute><GlobalMembers /></ProtectedRoute>} />
        </Routes>
      </div>
    </>
  );
}
