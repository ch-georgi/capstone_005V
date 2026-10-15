# WellQ Android — primera entrega

Responsable móvil: Christopher Georgi. React Native + Expo SDK 57, TypeScript y Expo Router. Android 10+; interfaz en español, Poppins local e identidad visual basada en las referencias del proyecto. Es un prototipo académico independiente del producto comercial WellQ.

## Iniciar

Usar Node 22.13+ compatible con el SDK y npm. Desde la raíz:

```powershell
npm.cmd ci --prefix apps/mobile
Copy-Item apps/mobile/.env.example apps/mobile/.env
npm.cmd start --prefix apps/mobile
```

El emulador usa `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1`. En un teléfono físico usar la IP LAN del equipo que ejecuta la API, en la misma red, o la URL HTTPS del despliegue. La URL es pública y se incorpora al bundle: nunca poner secretos en variables `EXPO_PUBLIC_*`. Reiniciar Expo después de cambiarla.

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

Exámenes, cargas y sincronización documental se desarrollan después. No hay botones ni estadísticas simulando esas capacidades.

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

Se activó este ajuste en el entorno local de Christopher. La plantilla `.env.example` conserva `false` por defecto para otros entornos. Reiniciar Expo limpiando su caché:

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

Salida: `apps/mobile/artifacts/wellq-0.1.0-demo.apk`, con firma de desarrollo. Este comando fuerza demo incluso si el `.env` dice false. Para otro APK con autenticación real de desarrollo, poner false y usar `apk:preview`. El comando `apk` / `apk:production` siempre desactiva demo y exige la URL HTTPS de producción. Un APK instalado no cambia al editar el `.env`: hay que recompilar y reinstalar. Las credenciales demo no existen en el backend ni otorgan acceso real.
