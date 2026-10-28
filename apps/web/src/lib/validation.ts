import { z } from "zod";
import { isValidRut } from "./rut";

/**
 * Los límites (largos, formatos) reflejan exactamente los DTO de la API
 * (apps/api/src/modules/auth/dto/login.dto.ts y users/dto/create-user.dto.ts).
 * Esto es solo UX: la API vuelve a validar todo en el servidor.
 */

const email = z
  .string()
  .trim()
  .min(1, "El correo es obligatorio.")
  .max(254, "El correo es demasiado largo.")
  .email("Ingresa un correo electrónico válido (ej: nombre@clinica.cl).")
  .transform((value) => value.toLowerCase());

/** Paso 1 del login: solo credenciales. */
export const credentialsSchema = z.object({
  email,
  password: z
    .string()
    .min(1, "La contraseña es obligatoria.")
    .max(128, "La contraseña es demasiado larga."),
});
export type CredentialsFormValues = z.infer<typeof credentialsSchema>;

export const tenantRoles = ["CLINIC_ADMIN", "CLINICIAN", "PATIENT"] as const;
export const tenantRoleLabels: Record<(typeof tenantRoles)[number], string> = {
  CLINIC_ADMIN: "Administrador de clínica",
  CLINICIAN: "Profesional clínico",
  PATIENT: "Paciente",
};

export const createUserSchema = z.object({
  email,
  password: z
    .string()
    .min(12, "La contraseña debe tener al menos 12 caracteres.")
    .max(128, "La contraseña es demasiado larga."),
  displayName: z
    .string()
    .trim()
    .min(1, "El nombre para mostrar es obligatorio.")
    .max(100, "El nombre es demasiado largo (máx. 100 caracteres)."),
  role: z.enum(tenantRoles, { message: "Selecciona un rol válido." }),
});
export type CreateUserFormValues = z.infer<typeof createUserSchema>;

export const staffRoles = ["CLINIC_ADMIN", "CLINICIAN"] as const;

export const updateMemberSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "El nombre para mostrar es obligatorio.")
    .max(100, "El nombre es demasiado largo (máx. 100 caracteres)."),
  role: z.enum(staffRoles, { message: "Selecciona un rol válido." }),
  isActive: z.boolean(),
});
export type UpdateMemberFormValues = z.infer<typeof updateMemberSchema>;

/**
 * Formulario de registro — vista preliminar 
 */
export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, "Tu nombre es obligatorio.")
      .max(100, "El nombre es demasiado largo (máx. 100 caracteres)."),
    // Campo "dni"  se ingresa en formato RUT chileno.
    dni: z
      .string()
      .trim()
      .min(1, "El DNI es obligatorio.")
      .refine(isValidRut, "El DNI ingresado no es válido (formato RUT chileno)."),
    email,
    password: z
      .string()
      .min(12, "La contraseña debe tener al menos 12 caracteres.")
      .max(128, "La contraseña es demasiado larga."),
    confirmPassword: z.string().min(1, "Confirma tu contraseña."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });
export type RegisterFormValues = z.infer<typeof registerSchema>;

/** Indicador de fuerza no bloqueante (la API solo exige largo >= 12). */
export function passwordStrength(value: string): { score: 0 | 1 | 2 | 3; label: string } {
  let score = 0;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
  const labels = ["Débil", "Aceptable", "Buena", "Fuerte"];
  return { score: score as 0 | 1 | 2 | 3, label: labels[score] };
}
