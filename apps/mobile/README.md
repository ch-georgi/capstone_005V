# WellQ Android — primera entrega

Responsable móvil: Christopher Georgi. React Native + Expo SDK 57, TypeScript y Expo Router. Android 10+; interfaz en español, Poppins local e identidad visual basada en las referencias del proyecto. Es un prototipo académico independiente del producto comercial WellQ.

## Iniciar

Usar Node 22.13+ compatible con el SDK y npm. Desde la raíz:

```powershell
npm.cmd ci --prefix apps/mobile
Copy-Item apps/mobile/.env.example apps/mobile/.env
npm.cmd start --prefix apps/mobile
```

La plantilla de desarrollo local usa `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1`; la configuración actual de este equipo usa Railway, como se indica al final de esta guía. En un teléfono físico usar la IP LAN del equipo que ejecuta la API, en la misma red, o la URL HTTPS del despliegue. La URL es pública y se incorpora al bundle: nunca poner secretos en variables `EXPO_PUBLIC_*`. Reiniciar Expo después de cambiarla.

Para una compilación nativa local se necesitan JDK compatible con Gradle, Android SDK y licencias aceptadas. `ANDROID_HOME` debe apuntar al SDK y `JAVA_HOME` al JDK. Los directorios nativos se generan; la configuración autoritativa es app.json + app.config.ts.

```powershell
npm.cmd run android --prefix apps/mobile
npm.cmd run apk:preview --prefix apps/mobile
```

`apk:preview` genera un APK autónomo de prueba para arm64 y x86_64 en `apps/mobile/artifacts/wellq-0.1.0-preview.apk`, firmado con la clave de desarrollo generada por Expo. No necesita Metro; no es una firma de distribución comercial. Configurar la URL antes de compilar. Para entornos desplegados usar HTTPS; HTTP solo corresponde al desarrollo local.

## Flujo de uso

1. Ingresar correo y contraseña entregados por la clínica. No hay registro público.
2. Si hay varias clínicas de paciente, elegir una. Con una sola, se abre directamente la bienvenida.
3. La bienvenida identifica clínica, nombre y estado: normal, histórico de solo lectura o ficha pendiente. Cambiar de clínica reemplaza la sesión actual.
4. La sesión dura 30 días desde el login. La app renueva automáticamente el JWT corto; cerrar y abrir no pide credenciales dentro de ese plazo. Las credenciales van en SecureStore; la contraseña y los desafíos no se guardan.
5. Sin red solo se muestra la última bienvenida informativa. No se consideran actuales sus permisos; se revalidan al reconectar. Cerrar sesión borra el acceso local; la revocación remota requiere conexión.
6. Para recuperar acceso: solicitar código, escribir los seis dígitos y definir una nueva contraseña de 12–128 caracteres. El código vence en diez minutos, tiene cinco intentos y se reenvía después de 60 segundos. La recuperación cierra las sesiones de la cuenta en todas sus clínicas.

Desde 0.2.0 se consultan exámenes y documentos reales. La carga móvil, SQLite y sincronización se desarrollan en etapas posteriores.

## API y datos sintéticos

Seguir [la guía de autenticación móvil](../api/MOBILE_AUTH.md) para migraciones y SMTP. El seed existente incluye `patient1@example.com` con `Demo1234!` en dos clínicas; `patient2@example.com` tiene una sola. Usar únicamente estos datos sintéticos en entornos de prueba. El seed no restablece contraseñas existentes, por lo que una recuperación cambia la contraseña de esa cuenta en ese entorno.

## Validación

```powershell
npm.cmd run typecheck --prefix apps/mobile
npm.cmd test --prefix apps/mobile
npm.cmd run export:android --prefix apps/mobile
```

Las pruebas cubren pantallas y navegación protegida, selección, reenvío/recuperación, renovación única concurrente, restauración, vencimiento absoluto, desconexión, salida local y respuestas tardías después de logout. Verificar manualmente teclado, texto ampliado y TalkBack en Android físico antes de la entrega final.

## APK de evidencia y recorrido Android

El APK de esta entrega se valida con la API aislada en `http://10.0.2.2:3101/api/v1` (emulador). Para instalarlo en un teléfono, configurar la URL LAN/HTTPS real y recompilar. El puerto 3000 de desarrollo no se modifica. La URL se guarda en la configuración pública de Expo y el script de APK regenera bundle y configuración para evitar reutilizar otro entorno.

Las capturas y resultados del recorrido están en `evidence/`. Para repetir el recorrido, iniciar el APK con el seed sintético (patient1@example.com / Demo1234!) y la API correspondiente; configurar ANDROID_HOME, ANDROID_SERIAL y WELLQ_SYNTHETIC_TESTS=1 y ejecutar `python apps/mobile/scripts/android-smoke.py` desde la raíz. El recorrido valida selección, bienvenida, restauración tras cerrar el proceso y logout. No usarlo con cuentas reales. Las pruebas en teléfono físico y con TalkBack quedan para un dispositivo conectado.

## Entornos local y producción

La vista web usa la API local con `npm run web`; `WELLQ_WEB_API_URL` permite cambiar su dirección (por defecto localhost:3000/api/v1). El comando `npm run apk` exige `WELLQ_PRODUCTION_API_URL` en `.env.production.local` y genera un APK que consume la API HTTPS desplegada. `apk:preview` conserva el entorno de desarrollo. PostgreSQL se configura exclusivamente en el servidor API.

Ver [configuración y despliegue en Railway](../api/RAILWAY.md). La base remota por sí sola no basta: primero hay que desplegar la API.

## Mockup sin backend: activar y desactivar

Para presentar login y bienvenida sin API, PostgreSQL ni internet, editar `apps/mobile/.env`:

```env
WELLQ_DEMO_MODE=true
```

El entorno local de Christopher usa actualmente `false` para acceder a Railway; cambiar a `true` para presentar nuevamente el mockup. La plantilla `.env.example` conserva `false` por defecto para otros entornos. Reiniciar Expo limpiando su caché:

```powershell
npm.cmd start --prefix apps/mobile -- --clear
# O para vista web:
npm.cmd run web --prefix apps/mobile -- --clear
```

Credenciales ficticias, visibles también en el login:

- Correo: `demo@wellq.app`
- Contraseña: `WellQDemo123!`

El acceso lleva directamente a «Hola, Christopher», en «Clínica WellQ Demo». Las pantallas muestran «Modo demostración · Datos ficticios». El correo se normaliza; la contraseña debe coincidir exactamente. Cerrar sesión devuelve al login. La sesión demo vive solo en memoria: al cerrar completamente la app o recargar la página se inicia otra presentación desde el login. No se leen ni sobrescriben credenciales reales guardadas en SecureStore. No hay llamadas de API, envíos de correo ni cambios de contraseña en este modo.

Para **desactivar** el mockup y volver a autenticación real, cambiar a `WELLQ_DEMO_MODE=false` y reiniciar Expo con `--clear`. Para **reactivarlo**, volver a `true` y reiniciar. La URL de la API sigue configurándose como se describe arriba y solo se usa cuando demo está desactivado.

Para un **APK autónomo de demostración**:

```powershell
npm.cmd run apk:demo --prefix apps/mobile
```

Salida: `apps/mobile/artifacts/wellq-0.2.0-demo.apk`, con firma de desarrollo. Este comando fuerza demo incluso si el `.env` dice false. Para otro APK con autenticación real de desarrollo, poner false y usar `apk:preview`. El comando `apk` / `apk:production` siempre desactiva demo y exige la URL HTTPS de producción. Un APK instalado no cambia al editar el `.env`: hay que recompilar y reinstalar. Las credenciales demo no existen en el backend ni otorgan acceso real.

## Acceso real a Railway (20 de octubre de 2026)

La API desplegada es `https://capstone005v-production.up.railway.app/api/v1`. Se configuró esta dirección en `.env` para Expo móvil y en `.env.production.local` para el APK, con demo desactivado. Los archivos de entorno no se versionan; en otro equipo hay que completar esos valores.

```env
# apps/mobile/.env
WELLQ_DEMO_MODE=false
EXPO_PUBLIC_API_URL=https://capstone005v-production.up.railway.app/api/v1
```

```env
# apps/mobile/.env.production.local
WELLQ_PRODUCTION_API_URL=https://capstone005v-production.up.railway.app/api/v1
```

Reiniciar Expo con `npm run start -- --clear` desde apps/mobile. El comando `web` conserva su API local (WELLQ_WEB_API_URL o localhost:3000); el `.env` de apps/api no cambia. Para instalar el acceso real en Android, ejecutar `npm run check:production` y `npm run apk` desde apps/mobile, e instalar `artifacts/wellq-0.1.0-production.apk`. Un APK demo instalado sigue siendo demo hasta reinstalar el APK real.

Cuentas sintéticas ya existentes en Railway, verificadas por API:

| Correo | Contraseña de pruebas | Flujo esperado |
| --- | --- | --- |
| patient2@example.com | Demo1234! | Clínica A, bienvenida «Paciente 2». |
| patient1@example.com | Demo1234! | Selección entre Clínica A y B; nombre según clínica. |

Estos usuarios son de prueba. La cuenta demo@wellq.app solo existe en el mockup. Para crear otra cuenta PATIENT con contraseña propia mediante la API administrativa, ver [procedimiento de alta en Railway](../api/RAILWAY.md#crear-un-paciente-adicional-de-prueba). El alta no crea ficha clínica: muestra el aviso de registro pendiente en la bienvenida. No reejecutar el seed ni restablecer cuentas existentes para esta validación.

## Segunda entrega: exámenes y Mi cuenta (0.2.0)

Las pestañas inferiores son Inicio, Mis exámenes y Mi cuenta. El listado pagina de 20 en 20, permite actualizar y filtrar por tipo y fechas (AAAA-MM-DD). El detalle ofrece la versión actual, el historial y acceso al documento de cada versión. Una ficha pendiente muestra un aviso; los errores de red o almacenamiento no se presentan como lista vacía.

Mi cuenta permite cambiar el nombre de presentación de la clínica actual, seleccionar Oscuro/Claro, cambiar de clínica y cerrar sesión. El correo se muestra con instrucciones para contactar a la clínica: no se envía ninguna solicitud. La apariencia se guarda localmente y conserva el modo oscuro como valor inicial.

El visor incorpora PDF.js local en WebView; PDF, PNG y JPEG se validan con MIME, tamaño, firma y SHA-256. Los PDF tienen controles de página y zoom. Descargar permite elegir una carpeta de Android; cancelar no es un error. Las copias guardadas por el usuario permanecen en esa carpeta; los temporales privados del visor se limpian al salir, cambiar de contexto y al arrancar. No existe caché documental offline.

`npm run prepare:viewer` genera `src/documents/pdf-runtime.generated.ts` desde la dependencia fijada en package-lock. Este archivo no se versiona. Los comandos de inicio, lint, tipos, tests y compilación lo generan automáticamente; CI también lo prepara después de npm ci. No requiere CDN.

Compilar para Railway:

```powershell
npm.cmd run check:production --prefix apps/mobile
npm.cmd run apk --prefix apps/mobile
```

Salida: `apps/mobile/artifacts/wellq-0.2.0-production.apk`, versionCode 2 y firma de desarrollo. El APK local usa `apk:preview` con WELLQ_DEMO_MODE=false y EXPO_PUBLIC_API_URL configurada antes de compilar (10.0.2.2:3102 para la API aislada en el emulador; una IP LAN para teléfono). Nunca incluir credenciales PostgreSQL en la app. El perfil de producción exige HTTPS y desactiva demo.

Evidencia de archivos y recorridos: [v020](evidence/v020/README.md). Las cuatro versiones ficticias de Railway se conservan para la cuenta patient2@example.com. El script de carga requiere WELLQ_SYNTHETIC_TESTS=1, SMOKE_API_URL y SMOKE_PASSWORD, y crea cuatro versiones por ejecución: no repetirlo solo para visualizar los documentos ya existentes.
