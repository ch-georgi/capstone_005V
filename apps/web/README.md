# WellQ — portal web

Frontend React/TypeScript para administración clínica y acceso de pacientes.

## Mis exámenes

El rol `PATIENT` dispone de acceso desde el menú y la bienvenida:

| Ruta | Función |
| --- | --- |
| `/mis-examenes` | Listado de 20 resultados, filtros por tipo/fechas y carga nueva |
| `/mis-examenes/:examId` | Detalle, versión vigente y carga de una nueva versión |
| `/mis-examenes/:examId/versiones` | Historial, responsables, visor y descargas |

Los filtros y página se conservan en la URL. `GET /auth/me` identifica la ficha
desde el servidor con JWT web o móvil. Se actualiza al entrar y recuperar foco.
Una ficha pendiente muestra un aviso; el acceso histórico permite consulta y
descarga, sin cargas. La API comprueba propiedad y clínica en cada solicitud.
El módulo paciente no ofrece edición ni eliminación de exámenes.

Las cargas requieren conexión. Admiten PDF, JPEG y PNG de 1 a 10.000.000 bytes,
título y profesional de hasta 200 caracteres, notas de hasta 2.000 y fecha clínica
válida `YYYY-MM-DD`, sin desplazamiento de zona horaria. Título, tipo y fecha son
obligatorios para crear; una versión nueva conserva los metadatos del examen.
El servidor asigna su número.

Un envío sin confirmación conserva en memoria su operación y archivo para
reintentar sin duplicados. Se advierte antes de abandonar, recargar o cerrar
sesión. Salir pierde ese reintento. El éxito requiere confirmación del servidor.
No hay cola persistente, sincronización local ni copias offline.

El visor usa PDF.js **6.4.299**, igual que el lockfile móvil, con worker local,
paginación y zoom. Las imágenes también admiten zoom. Antes de visualizar o
descargar se verifican MIME, firma, tamaño y SHA-256. Bearer solo va en cabecera;
los recursos y URLs temporales se liberan al cerrar o salir.

## Desarrollo y validación

Usar Node 22.13+ (rama 22) y `VITE_API_URL` según `.env.example`.

```powershell
npm.cmd ci --prefix apps/web
npm.cmd run dev --prefix apps/web
npm.cmd test --prefix apps/web
npm.cmd run lint --prefix apps/web
npm.cmd run build --prefix apps/web
```

Vitest/React Testing Library cubren permisos, ficha pendiente, errores, filtros,
paginación, respuestas atrasadas, reintentos e integridad. También se dibuja un
PDF sintético real de dos páginas. `.github/workflows/web.yml` ejecuta CI.

Las integraciones API `mobile-auth`, `exams-read`, `exam-files` y `patients`
requieren `TEST_DATABASE_URL` en una base **descartable** `*_schema_test`.
`exam-files` comprueba crear desde sesión web, consultar desde móvil, agregar
una versión desde móvil y leer ambas desde web, con auditoría y solo lectura.
No usa documentos ni cuentas reales.

## Publicación

1. Publicar primero la API siguiendo [RAILWAY.md](../api/RAILWAY.md). No hay
   migraciones nuevas para este módulo.
2. Verificar `/auth/me` con JWT web y selección de clínicas históricas.
3. Compilar/publicar web con `VITE_API_URL` del entorno y fallback SPA a
   `index.html` para `/mis-examenes/*`. Permitir el origen en `CORS_ORIGINS`.
4. Probar pacientes activo, histórico y sin ficha, y regresión del personal clínico.

El repositorio configura Railway para API; no declara un servicio de hosting o
comando de despliegue del frontend. Confirmar ese destino antes de publicar.

Referencias: [PDF.js](https://mozilla.github.io/pdf.js/examples/) y
[bloqueo de navegación de React Router](https://reactrouter.com/api/hooks/useBlocker).

## Referencia del proyecto Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
