# PLAN.md

## Objetivo

Implementar un CRUD de tareas para Piezario con persistencia local en `@react-native-async-storage/async-storage`, datos separados por usuario y una pantalla de bienvenida tras iniciar sesión.

## Contexto actual

- Stack actual: Expo SDK 54, React Native 0.81.5, React 19.1.0, TypeScript y Expo Router.
- Pantalla principal actual: `app/(tabs)/index.tsx` contiene el login.
- `@react-native-async-storage/async-storage` todavía no está instalado.
- La pestaña `explore` existe pero está oculta en `app/(tabs)/_layout.tsx`.
- El login actual valida email y contraseña; hay que preservar:
  - Email requerido con patrón básico.
  - Contraseña requerida con mínimo de 6 caracteres.
  - Mensaje exacto para contraseña ausente: `Faltan piezas: introduce contraseña`.
  - El icono de ojo personalizado controla la visibilidad de contraseña.
  - Mensajes de error en rojo y éxito en verde.
  - Copy de login en español.
  - Registro visible pero no funcional.

## Decisiones de implementación

1. **Identidad local del usuario**
   - Usar el email validado y normalizado (`trim().toLowerCase()`) como identificador local.
   - No guardar contraseñas en AsyncStorage.
   - Crear una sesión local mínima solo con el email para poder restaurar el usuario al reabrir la app.

2. **Persistencia por usuario**
   - AsyncStorage es persistente, asíncrono, no cifrado y guarda valores como strings.
   - Guardar arrays/objetos con `JSON.stringify` y leerlos con `JSON.parse`.
   - Usar claves versionadas:
     - Sesión: `piezario:v1:session`
     - Tareas por usuario: `piezario:v1:todos:${encodeURIComponent(emailNormalizado)}`
   - Esta separación evita que dos usuarios vean o modifiquen las tareas del otro en el mismo dispositivo.

3. **Navegación y superficie UI**
   - Mantener `app/(tabs)/index.tsx` como entrada principal.
   - Tras login correcto, mostrar en la misma ruta una pantalla home autenticada con bienvenida y CRUD de tareas.
   - No activar registro ni flujo real de autenticación hasta que se pida explícitamente.
   - Mantener la identidad visual de Piezario: tablero de piezas, base crema, tinta violeta y acentos coral/mostaza/turquesa.

## Dependencia requerida

Instalar la librería compatible con Expo SDK 54:

```bash
bun expo install @react-native-async-storage/async-storage
```

Después de instalar, `bun.lock` debe quedar actualizado y autoritativo.

## Modelo de datos

```ts
type UserSession = {
  email: string;
};

type TodoItem = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};
```

Reglas:

- `title` requerido; guardar `title.trim()`.
- No crear tareas vacías.
- `id` estable: usar `crypto.randomUUID()` si está disponible; si no, fallback local basado en timestamp y sufijo aleatorio.
- `createdAt` y `updatedAt` en ISO string.
- Al alternar completado o editar título, actualizar `updatedAt`.

## Archivos a crear o modificar

### 1. `lib/todo-storage.ts` nuevo

Responsabilidad: encapsular AsyncStorage y evitar que la UI conozca claves o serialización.

Funciones propuestas:

```ts
export type UserSession = { email: string };
export type TodoItem = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function loadSession(): Promise<UserSession | null>;
export async function saveSession(session: UserSession): Promise<void>;
export async function clearSession(): Promise<void>;
export async function loadTodos(email: string): Promise<TodoItem[]>;
export async function saveTodos(email: string, todos: TodoItem[]): Promise<void>;
```

Criterios:

- `loadSession` devuelve `null` si no hay sesión o si el JSON está corrupto.
- `loadTodos` devuelve `[]` si no hay tareas o si el JSON está corrupto.
- Las operaciones usan `try/catch` y propagan errores cuando la UI debe mostrar fallo de guardado.
- No se guarda ni se lee la contraseña.

### 2. `app/(tabs)/index.tsx` modificar

Responsabilidad: pasar de login validado a home local autenticado.

Estados necesarios:

```ts
const [session, setSession] = useState<UserSession | null>(null);
const [isBooting, setIsBooting] = useState(true);
const [todos, setTodos] = useState<TodoItem[]>([]);
const [newTodoTitle, setNewTodoTitle] = useState('');
const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
const [editingTitle, setEditingTitle] = useState('');
```

Flujo:

1. Al montar:
   - `loadSession()`.
   - Si hay sesión, cargar `loadTodos(session.email)`.
   - Mostrar estado de carga breve para evitar parpadeo login/home.
2. Login correcto:
   - Normalizar email.
   - Guardar sesión local con `saveSession({ email })`.
   - Cargar tareas de ese email.
   - Renderizar home.
3. Cerrar sesión:
   - `clearSession()`.
   - Limpiar `session`, `todos`, inputs y mensajes.
   - Mantener las tareas guardadas del usuario para la próxima sesión.
4. CRUD:
   - Crear: añadir tarea al inicio o final de la lista y persistir.
   - Leer: renderizar lista vacía o listado de tareas.
   - Actualizar: alternar `completed` y editar `title`.
   - Eliminar: quitar tarea y persistir.

## Diseño de la pantalla home

Copy en español:

- Título: `Bienvenido, {email}`
- Subtítulo: `Tus piezas pendientes están guardadas en este dispositivo.`
- Input: `Nueva pieza por encajar`
- Botón crear: `Añadir pieza`
- Estado vacío: `Aún no hay piezas. Añade la primera tarea para empezar el tablero.`
- Botón salir: `Cerrar sesión`

Tratamiento visual:

- Contenedor tipo tablero con tarjetas de tareas como piezas.
- Tareas completadas: texto tachado, menor opacidad y acento verde discreto.
- Acciones destructivas: rojo claro/visible.
- Error de carga/guardado: rojo.
- Éxito o confirmación breve: verde.
- Mantener buen contraste y áreas táctiles cómodas.

## Reglas de CRUD y persistencia

- Cada mutación debe actualizar estado local y persistir la lista del usuario activo.
- Si falla el guardado:
  - Mostrar error directo en rojo.
  - No cambiar silenciosamente a otro usuario ni perder tareas.
- No mezclar datos entre usuarios:
  - Todas las llamadas `loadTodos`/`saveTodos` reciben `session.email` normalizado.
- No borrar tareas al cerrar sesión.
- No borrar tareas de otros usuarios desde el flujo actual.

## Plan por fases

### Fase 1: Dependencia y capa de almacenamiento

- Ejecutar `bun expo install @react-native-async-storage/async-storage`.
- Crear `lib/todo-storage.ts` con tipos, claves, helpers de normalización y funciones públicas.
- Probar manualmente que `loadTodos` devuelve `[]` sin datos previos.

### Fase 2: Sesión local y home

- Modificar `app/(tabs)/index.tsx` para cargar sesión al montar.
- Cambiar `handleLogin` para guardar sesión local después de validar.
- Renderizar login si `session === null`.
- Renderizar home si existe sesión.
- Añadir cierre de sesión sin borrar tareas.

### Fase 3: CRUD de tareas

- Añadir formulario para crear tareas.
- Renderizar lista por usuario.
- Implementar completar/descompletar.
- Implementar edición inline del título.
- Implementar eliminación.
- Persistir después de cada mutación.

### Fase 4: Estados y UX

- Añadir estado de carga inicial.
- Añadir estado vacío.
- Añadir mensajes de error de almacenamiento.
- Revisar accesibilidad básica: labels, roles cuando apliquen, foco visible en web y targets táctiles.
- Ajustar estilos para preservar la metáfora de piezas.

### Fase 5: Verificación

- Ejecutar `bun run lint`.
- Smoke test en Expo Web:
  1. Iniciar app con `bun run web`.
  2. Login con `ana@example.com` y contraseña válida.
  3. Ver bienvenida de Ana.
  4. Crear, completar, editar y borrar una tarea.
  5. Crear una tarea persistente para Ana.
  6. Cerrar sesión.
  7. Login con `bea@example.com` y confirmar lista vacía.
  8. Crear una tarea para Bea.
  9. Cerrar sesión y volver a Ana.
  10. Confirmar que Ana ve sus propias tareas y no las de Bea.
- Detener el servidor de desarrollo antes de terminar.

## Criterios de aceptación

- El login sigue respetando el contrato actual, incluido el mensaje exacto de contraseña ausente.
- Un usuario ve una pantalla de bienvenida con su email después de iniciar sesión.
- Un usuario puede crear, ver, editar, completar y eliminar tareas.
- Las tareas persisten tras recargar la app.
- Dos emails distintos tienen listas distintas en el mismo dispositivo/navegador.
- Cerrar sesión no borra las tareas guardadas.
- No se almacena la contraseña.
- `bun run lint` pasa.
- El smoke test de Expo Web confirma separación de datos por usuario.

## Riesgos y límites

- AsyncStorage no está cifrado; no usarlo para contraseñas ni datos sensibles.
- La identidad por email es local y no prueba propiedad del email. Es suficiente para este CRUD local, no para autenticación real.
- En web, la persistencia depende del almacenamiento del navegador; limpiar datos del sitio borrará tareas.
- Si después se añade backend/auth real, solo debería cambiar el origen de `session.email`; las claves por usuario y el CRUD local pueden mantenerse o migrarse.
