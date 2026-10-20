# Acceso móvil real en Railway

Validado el 20 de octubre de 2026 contra https://capstone005v-production.up.railway.app/api/v1, con el APK de pruebas firmado para desarrollo y demoMode=false. No se creó otro usuario ni se ejecutaron seeds, migraciones o cambios de credenciales.

## Resultados

- API: patient2 abre sesión en Clínica A; patient1 obtiene las dos clínicas y permite seleccionar. Perfil real, rotación de refresh y logout pasan. El JWT revocado devuelve 401. También se verificó el login administrativo descrito en la guía de altas.
- Emulador Android 15: login de una y varias clínicas, bienvenida sin aviso demo, reapertura sin credenciales, cambio de cuenta y clínica, logout y protección al volver con Atrás pasan. Las sesiones del recorrido finalizaron con logout.
- 32 pruebas móviles y dos comprobaciones de configuración pasan; lint y TypeScript pasan.
- Dentro del APK se verificaron demoMode=false y la URL HTTPS correcta. El manifiesto Android desactiva HTTP sin cifrar.
- El archivo apps/api/.env se conservó sin cambios. El comando web mantiene la API local.

## Evidencias

`api-validation.json`, `android-smoke.json` y `apk-validation.json` contienen resultados y huella del APK, sin tokens ni contraseñas. Capturas originales del emulador: login.png, welcome-patient2.png, restored.png, clinics.png, welcome-patient1.png y switched-clinic.png.

La guía móvil explica la configuración y las cuentas sintéticas disponibles. La guía Railway de API incluye el procedimiento manual para crear un PATIENT adicional con contraseña propia. El APK está en apps/mobile/artifacts/wellq-0.1.0-production.apk; debe instalarse en lugar del APK demo. Falta la validación en teléfono físico.
