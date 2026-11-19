import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/global.css";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext";

const router = createBrowserRouter([{ path: "*", element: <AuthProvider><App /></AuthProvider> }]);
createRoot(document.getElementById("root")!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
