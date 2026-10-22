# Correccion Android 0.3.1 - 22 de octubre de 2026

## Carga multipart

Causa confirmada en el codigo instalado: Expo SDK 57 reemplaza fetch por expo/fetch,
y convertFormDataAsync rechaza las partes React Native {uri,name,type}. El cliente
las enviaba y clasificaba el rechazo de serializacion como fallo de red. El envio
corregido proporciona bytes del archivo privado, nombre original y MIME validado.
No cambia sobre, operationId, request_hash ni esquema SQLite; los pendientes pueden
reintentarse con la misma identidad despues de actualizar.

La regresion ejecuta FormData nativo de React Native con installFormDataPatch y
convertFormDataAsync reales de Expo 57 (jest.requireActual), reproduciendo el error
anterior y verificando bytes JPG, request JSON, filename, MIME y limite multipart.
Comprueba tambien que los errores HTTP de validacion se mantienen estructurados.

## Fecha

Calendario nativo mediante datetimepicker compatible con SDK 57, incluido en el
APK. Fecha del examen y filtros usan el mismo componente Android; web conserva su
control anterior. Se confirma solo la seleccion aceptada y se serializa usando
componentes locales de fecha, evitando el desplazamiento por conversion a UTC.

## Validacion

66 pruebas Jest y 2 pruebas de configuracion pasan. TypeScript y lint pasan.
La exportacion web y la compilacion nativa pasan (validation.json). El APK
conserva la firma de 0.3.0 y usa versionCode 4 (apk.json). El recorrido del JPG y calendario en el telefono del usuario queda
pendiente de confirmar con el nuevo APK.

El log de version 00000008-0000-4000-8000-000000000002 corresponde al PDF sintetico
creado por seed.ts (id(8,2)); ExamFilesService lo emite al leer un objeto ausente.
Es independiente de la nueva carga y no se alteraron archivos ni datos remotos.

## Actualizar conservando pendientes

Instalar wellq-0.3.1-production.apk sobre 0.3.0, sin desinstalar ni limpiar datos.
Abrir Cargas pendientes y sincronizar. Si una operacion agoto intentos, usar
Reintentar con los mismos datos. Validar despues JPG nuevo, fecha con calendario,
cancelacion y versiones, sin volver a crear una operacion ya pendiente.
