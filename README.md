# Piezario

Piezario es una app Expo / React Native con TypeScript orientada a una experiencia de acceso visualmente coherente con puzzles: cada dato de acceso se presenta como una pieza que debe encajar antes de entrar al tablero.

## 1. Objetivos de la app

- Informar a la comunidad puzzlera sobre eventos nacionales e internacionales de puzzles.
- Permitir que cada persona tenga su usuario dentro de Piezario.
- Facilitar que los usuarios compartan sus colecciones de rompecabezas.
- Registrar y compartir tiempos de armado de rompecabezas.
- Habilitar interacción social mediante comentarios entre usuarios.
- Mantener una experiencia visual coherente con el mundo puzzle: piezas, tablero, encaje y progreso.
- En la etapa actual, ofrecer una vista inicial de login con validaciones locales y una opción de registro marcada como `Próximamente`.

## 2. Estructura de carpetas

```txt
.
├── app/
│   ├── _layout.tsx              # Layout raíz de Expo Router
│   ├── modal.tsx                # Modal generado por la plantilla Expo
│   └── (tabs)/
│       ├── _layout.tsx          # Layout de tabs oculto para la pantalla de login
│       ├── index.tsx            # Vista principal de login de Piezario
│       └── explore.tsx          # Pantalla starter oculta del tab bar
├── assets/
│   └── images/                  # Íconos e imágenes generadas por create-expo-app
├── components/                  # Componentes starter reutilizables de Expo
├── constants/
│   └── theme.ts                 # Tokens base de color/tipografía de la plantilla
├── hooks/                       # Hooks starter para tema claro/oscuro
├── scripts/
│   └── reset-project.js         # Script starter para reiniciar la plantilla
├── app.json                     # Configuración Expo: nombre, slug, scheme, plugins
├── package.json                 # Scripts, dependencias y metadatos del paquete
├── bun.lock                     # Lockfile de Bun
├── tsconfig.json                # Configuración TypeScript basada en Expo
└── AGENTS.md                    # Reglas para agentes que trabajen en este repo
```

## 3. Justificación de decisiones

- **Expo SDK 54**: se mantiene porque es compatible con Expo Go durante la transición de SDK 57 indicada por la documentación de Expo.
- **React Native + TypeScript**: TypeScript reduce errores en cambios incrementales y mantiene una base más mantenible para futuras pantallas.
- **Bun como package manager**: el proyecto usa `bun.lock` y debe mantener Bun como gestor de paquetes.
- **Expo Router**: se conserva la estructura generada por `create-expo-app`; la vista de login vive en `app/(tabs)/index.tsx` y la tab bar se oculta para ofrecer una pantalla de acceso limpia.
- **Logo en React Native**: el logo de Piezario se construye con `View` y `Text`, sin añadir dependencias ni assets nuevos.
- **Estética puzzle**: la paleta cálida, bordes marcados, piezas rotadas y copy de “piezas” refuerzan el concepto de la app.
- **Validaciones locales**: el login aún no conecta con backend; valida formato de correo, presencia de contraseña y longitud mínima para dar feedback inmediato.
- **Registro no funcional**: se muestra como opción deshabilitada con “Próximamente” para preparar la interfaz sin prometer un flujo todavía inexistente.

## 4. Proveedor y modelos de IA

Durante la construcción documentada en este repositorio se usó un arnés agéntico con:

- **Proveedor/modelo de asistencia**: `openai-codex/gpt-5.5` dentro de Oh My Pi.
- **Context7 MCP**: usado para consultar documentación actual de Expo y React Native.
- **frontend-design skill**: usado para definir la identidad visual de Piezario y orientar el estilo de puzzles.

Estos modelos y herramientas pertenecen al proceso de desarrollo; no son dependencias de runtime de la app móvil.

## 5. Constitución de arnés agéntico

Las reglas de trabajo para agentes en Piezario son:

1. Consultar documentación versionada de Expo SDK 54 antes de cambiar código relacionado con Expo.
2. Usar Context7 para documentación actual de librerías, frameworks, SDKs y APIs.
3. Mantener compatibilidad con Expo Go salvo instrucción explícita en contra.
4. Usar Bun para instalación y ejecución de scripts.
5. No introducir dependencias nativas que requieran development build sin justificarlo.
6. Para cambios visuales, aplicar `frontend-design` y mantener coherencia con la identidad puzzle de Piezario.
7. Verificar cambios de UI con smoke test cuando sea posible.
8. Ejecutar `bun run lint` antes de entregar cambios permanentes.
9. No implementar flujos simulados como reales: el registro está visible, pero no funcional.
10. Mantener mensajes de validación claros y accesibles.

## 6. Instrucciones de ejecución

### Requisitos

- Node.js compatible con Expo SDK 54.
- Bun instalado.
- Expo Go instalado en un dispositivo físico si se desea probar en móvil.

### Instalar dependencias

```bash
bun install
```

### Correr la app

Iniciar el servidor de desarrollo:

```bash
bun run start
```

Luego, desde la terminal de Expo:

- Escanear el QR con Expo Go para abrir en Android/iOS.
- Presionar `a` para Android.
- Presionar `i` para iOS Simulator.
- Presionar `w` para web.

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

### Nota sobre Expo Go

El proyecto no usa `expo-dev-client`, por lo que `expo start` abre con Expo Go por defecto. Si se añade una dependencia que requiera código nativo personalizado, habrá que revisar esta decisión antes de mantener la compatibilidad con Expo Go.
