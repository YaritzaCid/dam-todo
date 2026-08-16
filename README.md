# Alisto

Alisto es una app Expo / React Native con TypeScript para gestionar tareas privadas por usuario. Permite crear cuenta local, iniciar sesión, revisar un resumen del día y administrar tareas con foto, GPS, sincronización MockAPI e importación controlada desde JSONPlaceholder.

## Objetivos

- Crear cuentas locales con nombre, correo y contraseña.
- Iniciar y restaurar sesión en el dispositivo.
- Mantener tareas separadas por usuario.
- Crear, completar, renombrar y eliminar tareas.
- Adjuntar foto a una tarea con cámara.
- Adjuntar coordenadas GPS con fallback a última ubicación conocida.
- Sincronizar manualmente tareas con MockAPI sin romper modo offline.
- Importar hasta 5 tareas desde JSONPlaceholder evitando duplicados.
- Mantener mensajes de validación claros, en español y con estados de error/éxito visibles.

## Estructura de carpetas

```txt
.
├── app/
│   ├── _layout.tsx              # Layout raíz de Expo Router
│   ├── modal.tsx                # Modal starter de Expo
│   └── (tabs)/
│       ├── _layout.tsx          # Tabs ocultas para usar index como superficie principal
│       ├── index.tsx            # Login, registro, resumen y tablero de tareas
│       └── explore.tsx          # Pantalla starter oculta
├── assets/
│   └── images/                  # Íconos e imágenes de Expo
├── components/                  # Componentes starter reutilizables
├── constants/
│   └── theme.ts                 # Tokens base de color de la plantilla
├── hooks/                       # Hooks starter de tema
├── lib/
│   ├── alisto-db.ts             # SQLite/localStorage, sesión, cuentas, tareas y sync
│   ├── remote-todo-api.ts       # Cliente HTTP de MockAPI y JSONPlaceholder
│   ├── todo-camera.ts           # Captura y persistencia de foto por tarea
│   ├── todo-location.ts         # GPS actual, fallback last-known y mensajes de error
│   └── validation-schemas.ts    # Validaciones de login, registro y tareas
├── __tests__/
│   ├── alisto-sync-test.ts      # Sync MockAPI, JSONPlaceholder y deduplicación
│   ├── remote-todo-api-test.ts  # Cliente API, errores HTTP/red/timeout/datos
│   ├── todo-camera-test.ts      # Cámara y persistencia de foto
│   └── todo-location-test.ts    # GPS válido, fallback y error
├── scripts/
│   └── reset-project.js         # Script starter para reiniciar la plantilla
├── .env.example                 # Plantilla versionable de configuración remota
├── app.json                     # Configuración Expo, permisos y plugins
├── package.json                 # Scripts, dependencias, Jest y metadatos
├── bun.lock                     # Lockfile autoritativo de Bun
├── tsconfig.json                # TypeScript estricto + tipos Jest
└── AGENTS.md                    # Reglas para agentes que trabajen en este repo
```

## Tecnologías utilizadas

- **React Native + Expo SDK 54**: base de la aplicación, elegida por ser la tecnología trabajada en clases y facilitar el desarrollo y prueba en Android.
- **TypeScript**: permite detectar errores mediante tipado estático y mantener un código más seguro.
- **Expo Camera y Expo Location**: utilizados para integrar cámara, permisos y geolocalización GPS.
- **Expo SQLite**: permite almacenar usuarios y tareas localmente, manteniendo la aplicación funcional sin conexión.
- **MockAPI**: utilizado para almacenar y sincronizar tareas de forma remota mediante una API REST.
- **JSONPlaceholder**: utilizado como API externa para importar tareas.
- **Jest + jest-expo**: utilizados para las pruebas automatizadas de cámara, ubicación y APIs.
- **Bun**: utilizado para gestionar dependencias y ejecutar los comandos del proyecto.

## Decisiones técnicas

- **Expo SDK 54 + Expo Router**: conserva compatibilidad con Expo Go y estructura de rutas generada por Expo.
- **React Native + TypeScript**: mantiene tipos explícitos para sesión, tareas, sync y validaciones.
- **Bun**: `bun.lock` es el lockfile autoritativo; usar `bun install` y `bun run <script>`.
- **SQLite local**: `expo-sqlite` guarda usuarios, sesión, tareas y `todo_sync` en Android/iOS.
- **Fallback web**: `localStorage` replica usuarios, sesión, tareas y registros de sync en web.
- **Cuentas locales**: la contraseña se guarda como hash con salt; no se guarda texto plano.
- **Separación por usuario**: las tareas se consultan y mutan por `userId`.
- **Cámara**: `expo-camera` captura foto; `expo-file-system` persiste archivo nativo; web/data URI se conserva sin copiar.
- **GPS**: `expo-location` usa ubicación actual; si falla, intenta última ubicación conocida antes de mostrar error.
- **MockAPI**: `lib/remote-todo-api.ts` lee `process.env.EXPO_PUBLIC_REMOTE_TODOS_URL`; no hay URL hardcodeada en código.
- **JSONPlaceholder**: importa desde `/todos`, limita a 5 elementos y deduplica por `jsonplaceholder:<id>`.
- **Modo offline primero**: CRUD local no depende de red; sync remota es acción manual y sus errores no bloquean la app.
- **Tests**: Jest + `jest-expo` cubren helpers de cámara, GPS, API remota y sync.

## Funcionalidad actual

1. Registro local con nombre, correo, contraseña y confirmación.
2. Login con correo y contraseña.
3. Restauración de sesión al abrir la app.
4. Resumen de tareas pendientes y completadas.
5. CRUD de tareas:
   - crear tarea;
   - marcar como completada o pendiente;
   - editar título;
   - eliminar con confirmación.
6. Adjuntos por tarea:
   - foto tomada con cámara;
   - coordenadas obtenidas del dispositivo.
7. Cierre de sesión sin borrar tareas.
8. Sincronización manual con MockAPI:
   - `GET` remoto después de procesar tombstones;
   - `POST` para tareas nuevas;
   - `PUT` para tareas existentes;
   - `DELETE` para eliminados locales;
   - una tarea eliminada no vuelve a SQLite/localStorage en el mismo sync.
9. Importación de tareas desde JSONPlaceholder `/todos`:
   - máximo 5 tareas;
   - guardado en SQLite/localStorage para el usuario actual;
   - prevención de duplicados por origen e ID externo.


## Verificaciones de funcionalidades

1. **Login y registro de Alisto**: la aplicación gestora de tareas permite crear una cuenta desde el acceso inicial. Esta pantalla valida correo, contraseña y campos obligatorios antes de continuar.

   ![Login y registro con validaciones](img/001.jpg)

2. **Cuenta creada e inicio de sesión**: después de crear la cuenta, la app confirma el registro y vuelve al inicio de sesión. El login mantiene sus validaciones de correo, contraseña y falta de información.

   ![Confirmación de cuenta e inicio de sesión](img/002.jpg)

3. **Bienvenida y resumen del día**: al ingresar, se muestra una vista de bienvenida con el nombre del usuario, el resumen de tareas pendientes y completadas, y las listas separadas por estado. Desde esta vista se puede entrar al tablero para revisar detalles o crear tareas.

   ![Bienvenida con resumen de tareas](img/003.jpg)

4. **Tablero de tareas**: al crear o ver tareas, la lista se muestra hacia abajo. Cada tarea habilita acciones para completar, añadir foto, añadir ubicación, editar y eliminar.

   ![Tablero con acciones por tarea](img/004.jpg)

5. **Permisos de foto y ubicación**: para añadir foto o ubicación, la app solicita primero los permisos correspondientes al usuario.

   ![Permiso para añadir ubicación](img/005.jpg)

   ![Permiso para añadir foto](img/006.jpg)

   ![Permiso adicional de ubicación o cámara](img/009.jpg)

6. **Sincronización con la web y móvil**: la aplicación está sincronizada con la web y permite traer tareas desde la API remota. Las capturas muestran la app en celular con la integración funcionando.

   ![Aplicación móvil sincronizada con la web](img/007.jpg)

   ![Tareas traídas desde la web en móvil](img/008.jpg)

## Contratos de validación

- El correo es requerido y debe tener formato básico válido.
- La contraseña es requerida y debe tener al menos 6 caracteres.
- El mensaje de contraseña ausente en login debe ser exactamente: `Faltan piezas: introduce contraseña`.
- El título de tarea no puede quedar vacío.
- Los errores se muestran en rojo.
- Los mensajes de éxito se muestran en verde.
- La visibilidad de contraseña se controla solo con el icono personalizado.

## Configuración remota

- `.env.example` es versionable y contiene:

```bash
EXPO_PUBLIC_REMOTE_TODOS_URL=<https://6a81d635400f94b23c6fac54.mockapi.io/api/v1/todos>
```

- `.env` es local y está ignorado por Git.
- El código solo debe leer `process.env.EXPO_PUBLIC_REMOTE_TODOS_URL`.
- La URL de MockAPI no debe hardcodearse en código fuente.

## Pruebas automatizadas

El proyecto tiene 13 tests en 4 suites:

- Cámara:
  - captura válida;
  - captura sin URI/error;
  - persistencia de foto.
- GPS:
  - ubicación válida;
  - fallback a última ubicación conocida;
  - error cuando no hay ubicación.
- API:
  - importación limitada a 5;
  - prevención de duplicados;
  - sincronización `POST`/`PUT`/`DELETE`;
  - error HTTP;
  - timeout/offline;
  - tarea eliminada no reinsertada.

Los tests mockean `expo-camera`, `expo-location`, `expo-file-system`, `expo-crypto`, `expo-sqlite`, `fetch` y `localStorage`; no dependen de Internet ni emulador.

## Instrucciones de ejecución

### Requisitos

- Node.js compatible con Expo SDK 54.
- Bun instalado.
- Expo Go instalado en un dispositivo físico si se desea probar en móvil.

### Instalar dependencias

```bash
bun install
```

### Configurar API remota

Copiar `.env.example` como `.env`:

```bash
EXPO_PUBLIC_REMOTE_TODOS_URL=https://6a81d635400f94b23c6fac54.mockapi.io/api/v1/todos
```

`.env` queda ignorado por Git; `.env.example` sí debe versionarse.

### Correr la app

```bash
bun run start
```

Desde la terminal de Expo:

- escanear el QR con Expo Go para Android/iOS;
- presionar `a` para Android;
- presionar `i` para iOS Simulator;
- presionar `w` para web.

También puedes iniciar directamente por plataforma:

```bash
bun run android
bun run ios
bun run web
```

### Tests, TypeScript y lint

```bash
bun run test:ci
bun run tsc --noEmit
bun run lint
npx expo-doctor
```

## Verificación requerida

Usar estos comandos antes de entregar cambios:

```bash
bun run test:ci
bun run tsc --noEmit
bun run lint
npx expo-doctor
```

Para cambios UI, además iniciar Expo Web o Expo Go, recorrer login/registro/tablero/sync/importación y detener el servidor al terminar.

## Nota sobre Expo Go

El proyecto no usa `expo-dev-client`. Si se añade una dependencia que requiera código nativo personalizado, primero hay que revisar el impacto sobre Expo Go.
