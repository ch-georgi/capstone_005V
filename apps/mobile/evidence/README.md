# Evidencias de la primera entrega móvil

Validación: 15 de octubre de 2026. Datos sintéticos y base de pruebas separada; no se migró la base de desarrollo ni se enviaron correos externos.

- 14 pruebas unitarias/HTTP de API y 32 de integración con PostgreSQL: pasan.
- 27 pruebas móviles: pantallas, navegación real de Expo Router, configuración de API, persistencia, concurrencia, desconexión y recuperación: pasan.
- 21 pruebas SQLite Python, 7 TypeScript y 10 escenarios PostgreSQL existentes: pasan.
- Instalación reproducible de dependencias verificada con `npm ci --dry-run`; tipos, build API y paquete Android válidos.
- APK autónomo arm64/x86_64, Android 10+, con firma de desarrollo. Su configuración fue inspeccionada dentro del paquete: API de prueba `http://10.0.2.2:3101/api/v1`.
- Recorrido en emulador Android 15: login real, dos clínicas autorizadas, bienvenida, restauración tras cerrar el proceso, logout y pantalla de recuperación: pasa.
- Recuperación contra SMTP real local Mailpit: código recibido, contraseña cambiada, JWT anterior revocado, nuevo login y logout: pasa.

Capturas: `login.png`, `clinics.png`, `welcome.png`, `restored.png` y `recovery.png`. Resultados estructurados y huella del APK: `validation.json`. Las imágenes provienen directamente de Android, sin edición.

Queda la comprobación en teléfono físico, con teclado/tamaño de texto/TalkBack de ese dispositivo, y configurar el proveedor SMTP y HTTPS del despliegue. Para compartir el APK con un teléfono hay que recompilar con una URL LAN/HTTPS accesible; `10.0.2.2` corresponde solo al emulador. Guía: [README móvil](../README.md).
