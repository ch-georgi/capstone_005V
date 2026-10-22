# Android 0.3.0 - validacion del 22 de octubre de 2026

Implementado: SQLite v3, cache de paciente/examen/versiones y tipos, endpoint sync,
carga de examenes y versiones con sobre inmutable, cola persistente, reintentos en
primer plano, salida con resolucion explicita y copias privadas verificadas por version.

## Resultados automatizados

- Backend: 171 pruebas unitarias; compilacion y TypeScript correctos.
- PostgreSQL descartable wellq_mobile_schema_test: 74 pruebas de integracion completas,
  incluidas 8 de lectura/sync,
  incluidas snapshot, aislamiento, eventos invisibles, tombstones y permisos.
- SQLite: 21 pruebas Python y 10 pruebas TypeScript, incluidas migracion v3,
  conservacion de pendientes, rollback y reactivacion de foreign_keys al reabrir.
- Movil: suite completa de 60 pruebas Jest y 2 de configuracion; ademas pasa
  una regresion nueva de cambio forzado de sesion (61 casos en total). Lint y
  TypeScript correctos.
  Los nuevos tests usan SQLite real y archivos/transporte simulados para comprobar
  durabilidad, identidad en reintentos, rollback, copias verificadas y corrupcion.
- Exportacion Android correcta. Compilacion APK preview inicial y production correctas; exportacion web correcta.
  El APK production final usa Railway y firma de desarrollo.

## Limites de aceptacion

No habia dispositivo Android conectado ni AVD disponible. No se afirma validacion
interactiva de selector, modo avion, reinicio, TalkBack o texto ampliado. Las historias
permanecen In Progress hasta ese recorrido y aceptacion del equipo.

Railway: sesion reautenticada y servicio/dominio verificados; SYNC_CURSOR_SECRET
configurado sin imprimirlo. Los dos intentos de desplegar el backend fueron rechazados por
Railway: "Deploys have been paused due to an upstream issue". El despliegue anterior
continua vigente. No se ejecutaron seeds, resets ni migraciones nuevas en remoto.
La validacion de sync remoto queda pendiente de que Railway acepte el despliegue.

## Recorrido reproducible en Android

1. Iniciar API local aislada con almacenamiento y SYNC_CURSOR_SECRET, o desplegar
   el backend actualizado y compilar el APK para esa URL.
2. Autenticar paciente sintetico, sincronizar y revisar listado/detalle/historial.
3. Subir PDF/JPG/PNG y nueva version; comprobar asignacion del servidor e historial.
4. Marcar versiones como disponibles sin conexion; activar modo avion, cerrar y
   reabrir la app, visualizar PDF e imagen, y comprobar version anterior explicita.
5. Registrar otra carga offline, reiniciar y reconectar con la app abierta;
   comprobar una sola publicacion, estado COMPLETED y limpieza del pendiente.
6. Probar archivo inexistente/corrupto, falta de espacio, selector cancelado y
   errores definitivos/transitorios. Verificar aislamiento al cambiar cuenta/clinica.
7. Con pendientes, probar cancelar salida, sincronizar y descartar; comprobar que
   logout elimina copias privadas y conserva las exportadas a carpeta.
8. Completar teclado, TalkBack y texto ampliado en telefono Android 10+.

`apk.json` registra hash, version, entorno, firma de desarrollo y HTTP deshabilitado del APK final. `validation.json` resume pruebas y pendientes.
