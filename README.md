# Alisto

Alisto es una app Expo / React Native con TypeScript para gestionar pendientes privados por usuario. La pantalla principal permite crear cuenta, iniciar sesión, revisar un resumen del día y administrar tareas con foto y ubicación opcionales.

## Objetivos

- Crear cuentas locales con nombre, correo y contraseña.
- Iniciar y restaurar sesión en el dispositivo.
- Mantener pendientes separados por usuario.
- Crear, completar, renombrar y eliminar pendientes.
- Añadir foto a un pendiente mediante cámara.
- Añadir coordenadas a un pendiente mediante ubicación del dispositivo.
- Mantener mensajes de validación claros, en español y con estados de error/éxito visibles.

## Estructura de carpetas

```txt
.
├── app/
│   ├── _layout.tsx              # Layout raíz de Expo Router
│   ├── modal.tsx                # Modal starter de Expo
│   └── (tabs)/
│       ├── _layout.tsx          # Tabs ocultas para usar index como superficie principal
│       ├── index.tsx            # Login, registro, resumen y tablero de pendientes
│       └── explore.tsx          # Pantalla starter oculta
├── assets/
│   └── images/                  # Íconos e imágenes de Expo
├── components/                  # Componentes starter reutilizables
├── constants/
│   └── theme.ts                 # Tokens base de color de la plantilla
├── hooks/                       # Hooks starter de tema
├── lib/
│   ├── alisto-db.ts             # Persistencia local, sesión, cuentas y pendientes
│   ├── remote-todo-api.ts       # Cliente HTTP de MockAPI y JSONPlaceholder
│   └── validation-schemas.ts    # Validaciones de login, registro y pendientes
├── scripts/
│   └── reset-project.js         # Script starter para reiniciar la plantilla
├── app.json                     # Configuración Expo, permisos y plugins
├── package.json                 # Scripts, dependencias y metadatos
├── bun.lock                     # Lockfile autoritativo de Bun
├── tsconfig.json                # Configuración TypeScript basada en Expo
└── AGENTS.md                    # Reglas para agentes que trabajen en este repo
```

## Decisiones técnicas

- **Expo SDK 54 + Expo Router**: conserva compatibilidad con Expo Go y estructura de rutas generada por Expo.
- **React Native + TypeScript**: mantiene tipos explícitos para sesión, pendientes y validaciones.
- **Bun**: `bun.lock` es el lockfile autoritativo; usar `bun install` y `bun run <script>`.
- **Persistencia local**: `expo-sqlite` guarda datos en Android/iOS; web usa `localStorage` como fallback.
- **Cuentas locales**: la contraseña se guarda como hash con salt; no se guarda texto plano.
- **Separación por usuario**: los pendientes se consultan y mutan por `userId`.
- **Cámara y ubicación**: `expo-camera`, `expo-file-system` y `expo-location` permiten adjuntar foto y coordenadas a cada pendiente.
- **UI en una ruta**: `app/(tabs)/index.tsx` contiene autenticación, resumen y tablero; la tab bar permanece oculta.
- **API remota configurable**: `lib/remote-todo-api.ts` lee `process.env.EXPO_PUBLIC_REMOTE_TODOS_URL`; la URL real vive en `.env`.
- **Modo offline primero**: las mutaciones locales no dependen de red; la sincronización con MockAPI es una acción explícita.

## Funcionalidad actual

1. Registro local con nombre, correo, contraseña y confirmación.
2. Login con correo y contraseña.
3. Restauración de sesión al abrir la app.
4. Resumen de pendientes activos y completados.
5. CRUD de pendientes:
   - crear pendiente;
   - marcar como completado o activo;
   - editar título;
   - eliminar con confirmación.
6. Adjuntos por pendiente:
   - foto tomada con cámara;
   - coordenadas obtenidas del dispositivo.
7. Cierre de sesión sin borrar pendientes.
8. Sincronización manual con MockAPI usando la URL configurada en `.env`.
9. Importación de tareas desde JSONPlaceholder `/todos`, con deduplicación por origen e ID externo.

## Contratos de validación

- El correo es requerido y debe tener formato básico válido.
- La contraseña es requerida y debe tener al menos 6 caracteres.
- El mensaje de contraseña ausente en login debe ser exactamente: `Faltan piezas: introduce contraseña`.
- El título de pendiente no puede quedar vacío.
- Los errores se muestran en rojo.
- Los mensajes de éxito se muestran en verde.
- La visibilidad de contraseña se controla solo con el icono personalizado.

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

Crear `.env` en la raíz:

```bash
EXPO_PUBLIC_REMOTE_TODOS_URL=<URL de MockAPI>
```

`.env` queda ignorado por Git; no hardcodear la URL remota en código.

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

### Lint

```bash
bun run lint
```

## Verificación recomendada

1. Ejecutar `bunx tsc --noEmit`.
2. Ejecutar `bun run lint`.
3. Ejecutar `bunx expo-doctor`.
4. Iniciar Expo Web con `bun run web`.
5. Crear una cuenta local.
6. Iniciar sesión.
7. Crear, completar, editar y eliminar un pendiente.
8. Sincronizar con MockAPI desde el panel `Integración API`.
9. Importar JSONPlaceholder dos veces y confirmar que la segunda importación marca duplicados.
10. Probar foto y ubicación cuando el entorno tenga permisos disponibles.
11. Cerrar sesión y confirmar que los pendientes persisten al volver a entrar con la misma cuenta.
12. Detener el servidor antes de terminar.

## Nota sobre Expo Go

El proyecto no usa `expo-dev-client`. Si se añade una dependencia que requiera código nativo personalizado, primero hay que revisar el impacto sobre Expo Go.
