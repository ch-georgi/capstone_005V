# Segunda entrega móvil WellQ 0.2.0

Validación del 20 de octubre de 2026. Solo cuentas y documentos ficticios; no se ejecutaron seeds en Railway ni se modificaron cuentas reales. Las cuatro versiones nuevas de cada entorno se conservan para revisión.

## Resultado

- PostgreSQL y MinIO locales reales: cuatro cargas, repetición idempotente y recuperación por view/download con tamaño, contenido y SHA-256 exactos. Una sesión nueva conserva dos versiones PDF; otro paciente recibe 404. Edición del nombre y restauración verificadas.
- Railway: mismos controles de almacenamiento; GET auth/me devuelve patientId, PATCH auth/me actualiza solo el nombre, rechaza correo adicional con 400 y cambio a clínica no autorizada con 403.
- APK local y Railway en Android 15: login, pestañas, listado, detalle, historial, PDF de dos páginas, PNG y JPEG visualizados. Se abrió también la versión PDF anterior en producción. Guardado mediante selector Android con hash exacto en ambos entornos. Cancelación del selector probada localmente.
- Temas oscuro y claro con capturas; persistencia al reiniciar y sesión restaurada. Mi cuenta actualiza el saludo; nombre sintético restaurado. Cambio de clínica limpia el contexto anterior y logout impide regresar a pestañas. Texto ampliado al 130 % comprobado en emulador y restaurado al 100 %.
- Archivo antiguo de Railway con STORAGE_OBJECT_MISSING: mensaje en español, reintento y regreso disponibles; la app permanece abierta. No se sustituyó ni eliminó ese archivo.
- 50 pruebas móviles y dos de configuración, lint, tipos y exportaciones web/Android pasan. Las 22 pruebas de integración de autenticación con PostgreSQL habían pasado antes del despliegue; el backend no recibió cambios funcionales adicionales en esta validación.

## Archivos y APK

`local/storage.json` y `production/storage.json` registran identificadores de exámenes/versiones y hashes; `profile.json`, `android.json`, `apk.json` y `validation.json` resumen resultados sin tokens ni contraseñas. Capturas originales: home-dark/light, exams-dark/light, detail, history, pdf-page-1/2, png, jpeg, saved y missing-file según entorno.

APK de Railway: `apps/mobile/artifacts/wellq-0.2.0-production.apk`. APK local: `apps/mobile/artifacts/wellq-0.2.0-preview.apk`. Ambos versionCode 2, Android 10+, arm64/x86_64 y firma de desarrollo. Se inspeccionaron URL y demoMode=false dentro del paquete; producción desactiva HTTP sin cifrar. El local requiere la API aislada activa en puerto 3102 y usa 10.0.2.2, accesible solo desde el emulador.

Para revisar Railway: instalar el APK production, entrar con patient2@example.com y la contraseña sintética documentada en README móvil, y abrir Mis exámenes → registros [PRUEBA MÓVIL]. No repetir el script de carga para revisar archivos existentes. Cuenta y clínica pueden cambiarse desde Mi cuenta. Las copias descargadas se guardan donde el usuario elija; no representan caché offline.

## Pendiente

No había teléfono físico conectado: quedan pruebas en Android 10+ físico, TalkBack y teclado de ese dispositivo. La exportación web pasa, pero no se realizó un recorrido interactivo completo en navegador. Las cargas móviles, SQLite y sincronización siguen fuera de alcance. PB-049 queda parcial y PB-055/PB-056 permanecen pendientes; otras historias de esta entrega se registran en progreso hasta aceptación final del equipo.
