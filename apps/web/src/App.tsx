import { Routes, Route } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Welcome } from "./pages/Welcome";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { CreateUser } from "./pages/CreateUser";
import { Patients } from "./pages/Patients";
import { PatientForm } from "./pages/PatientForm";
import { PatientDetail } from "./pages/PatientDetail";

export default function App() {
  return (
    <>
      <AppHeader />
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
      </Routes>
    </>
  );
}
