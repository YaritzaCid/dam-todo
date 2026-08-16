import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Directory, File, Paths } from 'expo-file-system';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';

import {
  clearSession,
  createTodo,
  deleteTodo,
  listTodos,
  loadSession,
  loginUser,
  registerUser,
  renameTodo,
  setTodoCompleted,
  setTodoPhoto,
  setTodoLocation,
  type TodoItem,
  type UserSession,
} from '@/lib/piezario-db';
import { loginSchema, registrationSchema, todoTitleSchema } from '@/lib/validation-schemas';

type AuthMode = 'login' | 'register';
type Feedback = { tone: 'error' | 'success'; message: string };
const WEB_PASSWORD_HIDDEN_STYLE =
  Platform.OS === 'web' ? ({ WebkitTextSecurity: 'disc' } as unknown as TextStyle) : undefined;
const TODO_PHOTO_DIRECTORY = 'todo-photos';
const LOCATION_REQUEST_TIMEOUT_MS = 12_000;
const LOCATION_LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;
const LOCATION_LAST_KNOWN_REQUIRED_ACCURACY_METERS = 5000;
const LOCATION_FAILURE_MESSAGE = 'No pudimos obtener la ubicación.';
const ANDROID_EMULATOR_LOCATION_FAILURE_MESSAGE =
  'No pudimos obtener la ubicación. En el emulador, activa Ubicación, fija una coordenada GPS ' +
  'y desactiva Google Location Accuracy si sigue fallando.';

type TodoLocationFix = {
  location: Location.LocationObject;
  source: 'current' | 'last-known';
};

function withTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Location request timed out'));
    }, timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

async function getTodoLocationFix(): Promise<TodoLocationFix> {
  try {
    const location = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Platform.OS === 'android' ? Location.Accuracy.High : Location.Accuracy.Balanced,
      }),
      LOCATION_REQUEST_TIMEOUT_MS
    );

    return { location, source: 'current' };
  } catch (error) {
    const lastKnownLocation = await Location.getLastKnownPositionAsync({
      maxAge: LOCATION_LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: LOCATION_LAST_KNOWN_REQUIRED_ACCURACY_METERS,
    });

    if (lastKnownLocation) {
      return { location: lastKnownLocation, source: 'last-known' };
    }

    throw error;
  }
}



async function persistTodoPhotoUri(photoUri: string, todoId: string) {
  if (Platform.OS === 'web' || photoUri.startsWith('data:')) {
    return photoUri;
  }

  const directory = new Directory(Paths.document, TODO_PHOTO_DIRECTORY);
  directory.create({ idempotent: true, intermediates: true });

  const source = new File(photoUri);
  const destination = new File(directory, `${todoId}-${Date.now()}.jpg`);
  source.copy(destination);

  return destination.uri;
}

export default function PiezarioTodoApp() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
  const [cameraTodoId, setCameraTodoId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isLocatingTodoId, setIsLocatingTodoId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapSession() {
      try {
        const storedSession = await loadSession();

        if (!isMounted || !storedSession) {
          return;
        }

        const storedTodos = await listTodos(storedSession.id);

        if (!isMounted) {
          return;
        }

        setSession(storedSession);
        setTodos(storedTodos);
      } catch {
        if (isMounted) {
          setFeedback({ tone: 'error', message: 'No pudimos cargar tus piezas guardadas.' });
        }
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    }

    bootstrapSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const activateSession = async (nextSession: UserSession, message: string) => {
    const userTodos = await listTodos(nextSession.id);

    setSession(nextSession);
    setTodos(userTodos);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setNewTodoTitle('');
    setEditingTodoId(null);
    setEditingTitle('');
    setFeedback({ tone: 'success', message });
  };

  const handleLogin = async () => {
    const validation = loginSchema.safeParse({ email, password });

    if (!validation.success) {
      setFeedback({ tone: 'error', message: validation.error.issues[0]?.message ?? 'Las piezas no encajan.' });
      return;
    }

    setIsBusy(true);

    try {
      const result = await loginUser(validation.data.email, validation.data.password);

      if (!result.ok) {
        setFeedback({ tone: 'error', message: result.message });
        return;
      }

      await activateSession(result.session, `Pieza colocada: ${result.session.email}.`);
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos iniciar sesión. Inténtalo de nuevo.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRegister = async () => {
    const validation = registrationSchema.safeParse({ email, password, confirmPassword });

    if (!validation.success) {
      setFeedback({ tone: 'error', message: validation.error.issues[0]?.message ?? 'Revisa los datos de registro.' });
      return;
    }

    setIsBusy(true);

    try {
      const result = await registerUser(validation.data.email, validation.data.password);

      if (!result.ok) {
        setFeedback({ tone: 'error', message: result.message });
        return;
      }

      await activateSession(result.session, `Cuenta creada: ${result.session.email}.`);
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos crear la cuenta. Inténtalo de nuevo.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleLogout = async () => {
    setIsBusy(true);

    try {
      await clearSession();
      setSession(null);
      setTodos([]);
      setNewTodoTitle('');
      setEditingTodoId(null);
      setEditingTitle('');
      setAuthMode('login');
      setFeedback({ tone: 'success', message: 'Sesión cerrada. Tus piezas siguen guardadas.' });
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos cerrar sesión.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateTodo = async () => {
    if (!session) {
      return;
    }

    const validation = todoTitleSchema.safeParse(newTodoTitle);

    if (!validation.success) {
      setFeedback({ tone: 'error', message: validation.error.issues[0]?.message ?? 'La tarea no puede estar vacía.' });
      return;
    }

    setIsBusy(true);

    try {
      const todo = await createTodo(session.id, validation.data);
      setTodos((currentTodos) => [todo, ...currentTodos]);
      setNewTodoTitle('');
      setFeedback({ tone: 'success', message: 'Pieza añadida al tablero.' });
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos guardar la tarea.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleTodo = async (todo: TodoItem) => {
    if (!session) {
      return;
    }

    const nextCompleted = !todo.completed;
    setIsBusy(true);

    try {
      const updatedAt = await setTodoCompleted(session.id, todo.id, nextCompleted);
      setTodos((currentTodos) =>
        currentTodos.map((currentTodo) =>
          currentTodo.id === todo.id
            ? { ...currentTodo, completed: nextCompleted, updatedAt }
            : currentTodo
        )
      );
      setFeedback({
        tone: 'success',
        message: nextCompleted ? 'Pieza completada.' : 'Pieza marcada como pendiente.',
      });
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos actualizar la tarea.' });
    } finally {
      setIsBusy(false);
    }
  };

  const startEditingTodo = (todo: TodoItem) => {
    setEditingTodoId(todo.id);
    setEditingTitle(todo.title);
  };

  const cancelEditingTodo = () => {
    setEditingTodoId(null);
    setEditingTitle('');
  };

  const handleSaveTodoTitle = async (todo: TodoItem) => {
    if (!session) {
      return;
    }

    const validation = todoTitleSchema.safeParse(editingTitle);

    if (!validation.success) {
      setFeedback({ tone: 'error', message: validation.error.issues[0]?.message ?? 'La tarea no puede estar vacía.' });
      return;
    }

    if (validation.data === todo.title) {
      cancelEditingTodo();
      return;
    }

    setIsBusy(true);

    try {
      const updatedAt = await renameTodo(session.id, todo.id, validation.data);
      setTodos((currentTodos) =>
        currentTodos.map((currentTodo) =>
          currentTodo.id === todo.id
            ? { ...currentTodo, title: validation.data, updatedAt }
            : currentTodo
        )
      );
      cancelEditingTodo();
      setFeedback({ tone: 'success', message: 'Pieza renombrada.' });
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos editar la tarea.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteTodo = async (todo: TodoItem) => {
    if (!session) {
      return;
    }

    setIsBusy(true);

    try {
      await deleteTodo(session.id, todo.id);
      setTodos((currentTodos) => currentTodos.filter((currentTodo) => currentTodo.id !== todo.id));
      setFeedback({ tone: 'success', message: 'Pieza retirada del tablero.' });
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos eliminar la tarea.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleSetTodoLocation = async (todo: TodoItem) => {
    if (!session) {
      return;
    }

    setIsBusy(true);
    setIsLocatingTodoId(todo.id);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        setFeedback({ tone: 'error', message: 'Activa la ubicación para añadir coordenadas a la pieza.' });
        return;
      }

      const hasLocationServices = await Location.hasServicesEnabledAsync();

      if (!hasLocationServices) {
        setFeedback({ tone: 'error', message: 'Activa la ubicación del dispositivo para añadir coordenadas.' });
        return;
      }

      const { location: currentLocation, source } = await getTodoLocationFix();
      const { latitude, longitude } = currentLocation.coords;
      const updatedAt = await setTodoLocation(session.id, todo.id, latitude, longitude);

      setTodos((currentTodos) =>
        currentTodos.map((currentTodo) =>
          currentTodo.id === todo.id
            ? { ...currentTodo, locationLatitude: latitude, locationLongitude: longitude, updatedAt }
            : currentTodo
        )
      );
      setFeedback({
        tone: 'success',
        message:
          source === 'last-known'
            ? 'Últimas coordenadas disponibles encajadas en la pieza.'
            : 'Coordenadas encajadas en la pieza.',
      });
    } catch {
      setFeedback({
        tone: 'error',
        message:
          Platform.OS === 'android' ? ANDROID_EMULATOR_LOCATION_FAILURE_MESSAGE : LOCATION_FAILURE_MESSAGE,
      });
    } finally {
      setIsBusy(false);
      setIsLocatingTodoId(null);
    }
  };

  const openCameraForTodo = async (todo: TodoItem) => {
    if (!session) {
      return;
    }

    if (!cameraPermission?.granted) {
      const nextPermission = await requestCameraPermission();

      if (!nextPermission.granted) {
        setFeedback({ tone: 'error', message: 'Activa la cámara para añadir una foto a la pieza.' });
        return;
      }
    }

    setCameraTodoId(todo.id);
    setCameraFacing('back');
    setIsCameraReady(false);
    setIsCameraOpen(true);
    setFeedback(null);
  };

  const closeCamera = () => {
    if (isTakingPhoto) {
      return;
    }

    setIsCameraOpen(false);
    setCameraTodoId(null);
    setIsCameraReady(false);
  };

  const toggleCameraFacing = () => {
    setCameraFacing((currentFacing) => (currentFacing === 'back' ? 'front' : 'back'));
  };

  const handleTakeTodoPhoto = async () => {
    if (!session || !cameraTodoId || !cameraRef.current) {
      return;
    }

    setIsTakingPhoto(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.82,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        throw new Error('Camera returned no photo URI.');
      }

      const storedPhotoUri = await persistTodoPhotoUri(photo.uri, cameraTodoId);
      const updatedAt = await setTodoPhoto(session.id, cameraTodoId, storedPhotoUri);
      setTodos((currentTodos) =>
        currentTodos.map((currentTodo) =>
          currentTodo.id === cameraTodoId
            ? { ...currentTodo, photoUri: storedPhotoUri, updatedAt }
            : currentTodo
        )
      );
      setFeedback({ tone: 'success', message: 'Foto encajada en la pieza.' });
      setIsCameraOpen(false);
      setCameraTodoId(null);
      setIsCameraReady(false);
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos guardar la foto.' });
    } finally {
      setIsTakingPhoto(false);
    }
  };

  const switchAuthMode = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setFeedback(null);
  };

  if (isBooting) {
    return (
      <View style={styles.screen}>
        <View style={styles.cornerPiece} />
        <View style={styles.floatingPiece} />
        <View style={styles.loadingPanel}>
          <ActivityIndicator color="#5B4265" size="large" />
          <Text style={styles.loadingText}>Preparando tu tablero de piezas...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.screen}>
      <View style={styles.cornerPiece} />
      <View style={styles.floatingPiece} />
      <View style={styles.boardGrid}>
        {Array.from({ length: 10 }).map((_, index) => (
          <View key={index} style={styles.gridDot} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {session ? renderTodoBoard(session) : renderAuthPanel()}
      </ScrollView>
      {renderCameraModal()}
    </KeyboardAvoidingView>
  );

  function renderAuthPanel() {
    const isRegisterMode = authMode === 'register';

    return (
      <View style={styles.panel}>
        {renderLogoLockup()}

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Puzzle de acceso</Text>
          <Text style={styles.title}>Coloca tus piezas para entrar.</Text>
          <Text style={styles.subtitle}>
            Reúne correo y contraseña para abrir tu tablero personal de Piezario.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Correo</Text>
            <TextInput
              accessibilityLabel="Correo"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!isBusy}
              inputMode="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="nombre@correo.com"
              placeholderTextColor="#8D7B68"
              returnKeyType="next"
              style={styles.input}
              textContentType="emailAddress"
              value={email}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.passwordInputShell}>
              <TextInput
                accessibilityLabel="Contraseña"
                editable={!isBusy}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#8D7B68"
                returnKeyType={isRegisterMode ? 'next' : 'done'}
                secureTextEntry={Platform.OS !== 'web' && !isPasswordVisible}
                style={[
                  styles.input,
                  styles.passwordInput,
                  !isPasswordVisible && WEB_PASSWORD_HIDDEN_STYLE,
                ]}
                value={password}
              />
              {renderPasswordToggle()}
            </View>
          </View>

          {isRegisterMode ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirmar contraseña</Text>
              <TextInput
                accessibilityLabel="Confirmar contraseña"
                editable={!isBusy}
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                placeholderTextColor="#8D7B68"
                returnKeyType="done"
                secureTextEntry={Platform.OS !== 'web' && !isPasswordVisible}
                style={[styles.input, !isPasswordVisible && WEB_PASSWORD_HIDDEN_STYLE]}
                value={confirmPassword}
              />
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isBusy }}
            disabled={isBusy}
            onPress={isRegisterMode ? handleRegister : handleLogin}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              isBusy && styles.disabledControl,
            ]}>
            <Text style={styles.buttonText}>{isRegisterMode ? 'Crear cuenta' : 'Encajar piezas'}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => switchAuthMode(isRegisterMode ? 'login' : 'register')}
            style={({ pressed }) => [
              styles.registerOption,
              pressed && styles.registerOptionPressed,
              isBusy && styles.disabledControl,
            ]}>
            <View style={styles.registerPiece} />
            <View style={styles.registerCopy}>
              <Text style={styles.registerQuestion}>
                {isRegisterMode ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}
              </Text>
              <Text style={styles.registerAction}>
                {isRegisterMode ? 'Iniciar sesión' : 'Crear cuenta'}
              </Text>
            </View>
          </Pressable>

          {renderFeedback()}
        </View>
      </View>
    );
  }

  function renderTodoBoard(activeSession: UserSession) {
    return (
      <View style={[styles.panel, styles.boardPanel]}>
        {renderLogoLockup()}

        <View style={styles.boardHeader}>
          <View style={styles.copy}>
            <Text style={styles.eyebrow}>Tablero To-Do</Text>
            <Text style={styles.title}>Bienvenido, {activeSession.email}</Text>
            <Text style={styles.subtitle}>Tus piezas pendientes están guardadas en este dispositivo.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isBusy }}
            disabled={isBusy}
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && styles.logoutButtonPressed,
              isBusy && styles.disabledControl,
            ]}>
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </Pressable>
        </View>

        <View style={styles.todoComposer}>
          <Text style={styles.label}>Nueva pieza por encajar</Text>
          <View style={styles.todoInputRow}>
            <TextInput
              accessibilityLabel="Nueva pieza por encajar"
              editable={!isBusy}
              onChangeText={setNewTodoTitle}
              placeholder="Ej. Repasar Expo SQLite"
              placeholderTextColor="#8D7B68"
              returnKeyType="done"
              style={[styles.input, styles.todoInput]}
              value={newTodoTitle}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
              disabled={isBusy}
              onPress={handleCreateTodo}
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.buttonPressed,
                isBusy && styles.disabledControl,
              ]}>
              <Text style={styles.buttonText}>Añadir pieza</Text>
            </Pressable>
          </View>
        </View>

        {renderFeedback()}

        <View style={styles.todoList}>
          {todos.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyPiece} />
              <Text style={styles.emptyTitle}>Aún no hay piezas.</Text>
              <Text style={styles.emptyText}>Añade la primera tarea para empezar el tablero.</Text>
            </View>
          ) : (
            todos.map((todo) => renderTodoItem(todo))
          )}
        </View>
      </View>
    );
  }

  function renderTodoItem(todo: TodoItem) {
    const isEditing = editingTodoId === todo.id;

    return (
      <View key={todo.id} style={[styles.todoCard, todo.completed && styles.todoCardCompleted]}>
        <Pressable
          accessibilityLabel={`${todo.completed ? 'Marcar pendiente' : 'Completar'} ${todo.title}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: todo.completed, disabled: isBusy }}
          disabled={isBusy}
          onPress={() => handleToggleTodo(todo)}
          style={({ pressed }) => [
            styles.todoCheck,
            todo.completed && styles.todoCheckCompleted,
            pressed && styles.todoCheckPressed,
          ]}>
          {todo.completed ? <MaterialIcons color="#FFF9EC" name="check" size={18} /> : null}
        </Pressable>

        <View style={styles.todoBody}>
          {isEditing ? (
            <TextInput
              accessibilityLabel={`Editar ${todo.title}`}
              autoFocus
              editable={!isBusy}
              onChangeText={setEditingTitle}
              placeholder="Nombre de la pieza"
              placeholderTextColor="#8D7B68"
              style={[styles.input, styles.editInput]}
              value={editingTitle}
            />
          ) : (
            <Text style={[styles.todoTitle, todo.completed && styles.todoTitleCompleted]}>{todo.title}</Text>
          )}
          <Text style={styles.todoMeta}>{todo.completed ? 'Completada' : 'Pendiente'}</Text>
          {todo.locationLatitude !== null && todo.locationLongitude !== null ? (
            <Text style={styles.todoCoordinates}>
              Latitud {todo.locationLatitude.toFixed(6)} · Longitud {todo.locationLongitude.toFixed(6)}
            </Text>
          ) : null}
          {todo.photoUri ? (
            <Image
              accessibilityLabel={`Foto de ${todo.title}`}
              source={{ uri: todo.photoUri }}
              style={styles.todoPhoto}
            />
          ) : null}
        </View>

        <View style={styles.todoActions}>
          {isEditing ? (
            <>
              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => handleSaveTodoTitle(todo)}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}>
                <Text style={styles.actionText}>Guardar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={cancelEditingTodo}
                style={({ pressed }) => [styles.ghostActionButton, pressed && styles.actionButtonPressed]}>
                <Text style={styles.ghostActionText}>Cancelar</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                accessibilityLabel={`${todo.photoUri ? 'Cambiar foto' : 'Añadir foto'} ${todo.title}`}
                accessibilityRole="button"
                disabled={isBusy || isTakingPhoto}
                onPress={() => openCameraForTodo(todo)}
                style={({ pressed }) => [styles.photoActionButton, pressed && styles.actionButtonPressed]}>
                <Text style={styles.photoActionText}>{todo.photoUri ? 'Cambiar foto' : 'Añadir foto'}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`${todo.locationLatitude !== null ? 'Actualizar ubicación' : 'Añadir ubicación'} ${todo.title}`}
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => handleSetTodoLocation(todo)}
                style={({ pressed }) => [styles.locationActionButton, pressed && styles.actionButtonPressed]}>
                <Text style={styles.locationActionText}>
                  {isLocatingTodoId === todo.id
                    ? 'Ubicando...'
                    : todo.locationLatitude !== null
                      ? 'Actualizar ubicación'
                      : 'Añadir ubicación'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Editar ${todo.title}`}
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => startEditingTodo(todo)}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}>
                <Text style={styles.actionText}>Editar</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Eliminar ${todo.title}`}
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => handleDeleteTodo(todo)}
                style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}>
                <Text style={styles.deleteText}>Eliminar</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  function renderCameraModal() {
    return (
      <Modal animationType="slide" onRequestClose={closeCamera} transparent visible={isCameraOpen}>
        <View style={styles.cameraOverlay}>
          <View style={styles.cameraPanel}>
            {cameraPermission?.granted ? (
              <CameraView
                ref={cameraRef}
                facing={cameraFacing}
                mode="picture"
                onCameraReady={() => setIsCameraReady(true)}
                style={styles.cameraPreview}
              />
            ) : (
              <View style={styles.cameraPermissionPanel}>
                <Text style={styles.cameraPermissionTitle}>Falta permiso de cámara</Text>
                <Text style={styles.cameraPermissionText}>
                  Activa la cámara para tomar una foto y encajarla en esta pieza.
                </Text>
              </View>
            )}

            <View style={styles.cameraActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isTakingPhoto}
                onPress={closeCamera}
                style={({ pressed }) => [styles.cameraGhostButton, pressed && styles.actionButtonPressed]}>
                <Text style={styles.cameraGhostText}>Cancelar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isTakingPhoto}
                onPress={toggleCameraFacing}
                style={({ pressed }) => [styles.cameraGhostButton, pressed && styles.actionButtonPressed]}>
                <Text style={styles.cameraGhostText}>Girar cámara</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isTakingPhoto || !cameraPermission?.granted || !isCameraReady}
                onPress={handleTakeTodoPhoto}
                style={({ pressed }) => [
                  styles.cameraCaptureButton,
                  pressed && styles.buttonPressed,
                  (isTakingPhoto || !cameraPermission?.granted || !isCameraReady) && styles.disabledControl,
                ]}>
                <Text style={styles.buttonText}>
                  {isTakingPhoto ? 'Tomando foto...' : isCameraReady ? 'Tomar foto' : 'Preparando cámara...'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  function renderLogoLockup() {
    return (
      <View style={styles.logoLockup} accessibilityLabel="Logo de Piezario">
        <View style={styles.logoMark}>
          <View style={[styles.puzzlePiece, styles.pieceA]}>
            <View style={[styles.puzzleKnob, styles.knobRight]} />
          </View>
          <View style={[styles.puzzlePiece, styles.pieceB]}>
            <View style={[styles.puzzleKnob, styles.knobBottom]} />
          </View>
          <View style={[styles.puzzlePiece, styles.pieceC]}>
            <View style={[styles.puzzleKnob, styles.knobTop]} />
          </View>
          <View style={[styles.puzzlePiece, styles.pieceD]}>
            <Text style={styles.logoLetter}>P</Text>
          </View>
        </View>
        <View>
          <Text style={styles.logoName}>Piezario</Text>
          <Text style={styles.logoTagline}>Cada pieza en su lugar</Text>
        </View>
      </View>
    );
  }

  function renderPasswordToggle() {
    return (
      <Pressable
        accessibilityLabel={isPasswordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        accessibilityRole="button"
        onPress={() => setIsPasswordVisible((visible) => !visible)}
        style={({ pressed }) => [styles.passwordToggle, pressed && styles.passwordTogglePressed]}>
        <MaterialIcons
          color="#5B4265"
          name={isPasswordVisible ? 'visibility-off' : 'visibility'}
          size={22}
        />
      </Pressable>
    );
  }

  function renderFeedback() {
    if (!feedback) {
      return null;
    }

    return (
      <Text style={[styles.status, feedback.tone === 'error' ? styles.statusError : styles.statusSuccess]}>
        {feedback.message}
      </Text>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#F6E8CF',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  cornerPiece: {
    position: 'absolute',
    top: -72,
    right: -58,
    width: 190,
    height: 190,
    borderRadius: 42,
    backgroundColor: '#F2B84B',
    transform: [{ rotate: '18deg' }],
  },
  floatingPiece: {
    position: 'absolute',
    left: -46,
    bottom: 98,
    width: 118,
    height: 118,
    borderRadius: 30,
    backgroundColor: '#2DB7A3',
    transform: [{ rotate: '-14deg' }],
  },
  boardGrid: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5B426529',
  },
  loadingPanel: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 18,
    margin: 'auto',
    padding: 28,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#3E2A46',
    backgroundColor: '#FFF9EC',
  },
  loadingText: {
    color: '#3E2A46',
    fontSize: 16,
    fontWeight: '900',
  },
  panel: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: 30,
    padding: 28,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#3E2A46',
    backgroundColor: '#FFF9EC',
    shadowColor: '#3E2A46',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 16,
  },
  boardPanel: {
    maxWidth: 880,
  },
  logoLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoMark: {
    width: 72,
    height: 72,
    flexDirection: 'row',
    flexWrap: 'wrap',
    transform: [{ rotate: '-5deg' }],
  },
  puzzlePiece: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3E2A46',
  },
  pieceA: {
    borderTopLeftRadius: 16,
    backgroundColor: '#E85D75',
  },
  pieceB: {
    borderTopRightRadius: 16,
    marginLeft: -1,
    backgroundColor: '#F2B84B',
  },
  pieceC: {
    borderBottomLeftRadius: 16,
    marginTop: -1,
    backgroundColor: '#2DB7A3',
  },
  pieceD: {
    borderBottomRightRadius: 16,
    marginTop: -1,
    marginLeft: -1,
    backgroundColor: '#5B4265',
  },
  puzzleKnob: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#3E2A46',
    backgroundColor: '#FFF9EC',
  },
  knobRight: {
    right: -9,
    top: 9,
  },
  knobBottom: {
    bottom: -9,
    left: 9,
  },
  knobTop: {
    top: -9,
    left: 9,
  },
  logoLetter: {
    color: '#FFF9EC',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -1,
  },
  logoName: {
    color: '#3E2A46',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  logoTagline: {
    marginTop: 2,
    color: '#8D4E5B',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  copy: {
    gap: 10,
  },
  eyebrow: {
    color: '#2B8F82',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#3E2A46',
    fontSize: 35,
    fontWeight: '900',
    lineHeight: 39,
    letterSpacing: -1.5,
  },
  subtitle: {
    color: '#6F5B4B',
    fontSize: 16,
    lineHeight: 23,
  },
  form: {
    gap: 18,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: '#4B354F',
    fontSize: 14,
    fontWeight: '900',
  },
  input: {
    minHeight: 54,
    borderWidth: 2,
    borderColor: '#D6BE99',
    borderRadius: 16,
    paddingHorizontal: 18,
    color: '#3E2A46',
    backgroundColor: '#FFFDF7',
    fontSize: 16,
  },
  passwordInputShell: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 56,
  },
  passwordToggle: {
    position: 'absolute',
    right: 8,
    top: 7,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  passwordTogglePressed: {
    backgroundColor: '#F2E2C7',
  },
  button: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#3E2A46',
    backgroundColor: '#5B4265',
  },
  buttonPressed: {
    transform: [{ translateY: 2 }],
    backgroundColor: '#4A3553',
  },
  buttonText: {
    color: '#FFF9EC',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.1,
  },
  registerOption: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: '#D6BE99',
    borderStyle: 'dashed',
    borderRadius: 16,
    backgroundColor: '#FFFDF7',
  },
  registerOptionPressed: {
    backgroundColor: '#F8EBD4',
  },
  registerPiece: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3E2A46',
    backgroundColor: '#F2B84B',
    transform: [{ rotate: '10deg' }],
  },
  registerCopy: {
    flex: 1,
    gap: 2,
  },
  registerQuestion: {
    color: '#6F5B4B',
    fontSize: 13,
    fontWeight: '800',
  },
  registerAction: {
    color: '#3E2A46',
    fontSize: 15,
    fontWeight: '900',
  },
  status: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  statusError: {
    color: '#C03232',
  },
  statusSuccess: {
    color: '#2B8F82',
  },
  disabledControl: {
    opacity: 0.62,
  },
  boardHeader: {
    gap: 18,
  },
  logoutButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#3E2A46',
    backgroundColor: '#FFFDF7',
  },
  logoutButtonPressed: {
    backgroundColor: '#F8EBD4',
  },
  logoutText: {
    color: '#3E2A46',
    fontSize: 14,
    fontWeight: '900',
  },
  todoComposer: {
    gap: 10,
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#F8EBD4',
  },
  todoInputRow: {
    gap: 10,
  },
  todoInput: {
    flex: 1,
  },
  addButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#3E2A46',
    backgroundColor: '#5B4265',
  },
  todoList: {
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    padding: 24,
    borderWidth: 2,
    borderColor: '#D6BE99',
    borderStyle: 'dashed',
    borderRadius: 22,
    backgroundColor: '#FFFDF7',
  },
  emptyPiece: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3E2A46',
    backgroundColor: '#2DB7A3',
    transform: [{ rotate: '-8deg' }],
  },
  emptyTitle: {
    color: '#3E2A46',
    fontSize: 18,
    fontWeight: '900',
  },
  emptyText: {
    color: '#6F5B4B',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  todoCard: {
    gap: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: '#3E2A46',
    borderRadius: 22,
    backgroundColor: '#FFFDF7',
  },
  todoCardCompleted: {
    borderColor: '#2B8F82',
    backgroundColor: '#F2FBF4',
  },
  todoCheck: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3E2A46',
    borderRadius: 12,
    backgroundColor: '#FFF9EC',
  },
  todoCheckCompleted: {
    borderColor: '#2B8F82',
    backgroundColor: '#2B8F82',
  },
  todoCheckPressed: {
    transform: [{ scale: 0.95 }],
  },
  todoBody: {
    flex: 1,
    gap: 4,
  },
  todoTitle: {
    color: '#3E2A46',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 23,
  },
  todoTitleCompleted: {
    color: '#587063',
    textDecorationLine: 'line-through',
    opacity: 0.72,
  },
  todoMeta: {
    color: '#8D7B68',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  todoCoordinates: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    color: '#3E2A46',
    backgroundColor: '#E4F6F2',
    fontSize: 12,
    fontWeight: '900',
  },
  todoPhoto: {
    width: '100%',
    height: 180,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#3E2A46',
    borderRadius: 18,
    backgroundColor: '#E8D8BE',
  },
  editInput: {
    minHeight: 46,
  },
  todoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F2B84B',
  },
  actionButtonPressed: {
    opacity: 0.76,
  },
  actionText: {
    color: '#3E2A46',
    fontSize: 13,
    fontWeight: '900',
  },
  photoActionButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#2DB7A3',
  },
  photoActionText: {
    color: '#FFF9EC',
    fontSize: 13,
    fontWeight: '900',
  },
  locationActionButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#5B4265',
  },
  locationActionText: {
    color: '#FFF9EC',
    fontSize: 13,
    fontWeight: '900',
  },
  ghostActionButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#E8D8BE',
  },
  ghostActionText: {
    color: '#4B354F',
    fontSize: 13,
    fontWeight: '900',
  },
  deleteButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F8D6D6',
  },
  deleteButtonPressed: {
    backgroundColor: '#F2B8B8',
  },
  deleteText: {
    color: '#A12B2B',
    fontSize: 13,
    fontWeight: '900',
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
    backgroundColor: '#1D1222D9',
  },
  cameraPanel: {
    maxWidth: 720,
    width: '100%',
    maxHeight: '92%',
    alignSelf: 'center',
    gap: 14,
    padding: 14,
    borderWidth: 3,
    borderColor: '#FFF9EC',
    borderRadius: 28,
    backgroundColor: '#3E2A46',
  },
  cameraPreview: {
    minHeight: 420,
    overflow: 'hidden',
    borderRadius: 20,
  },
  cameraPermissionPanel: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 22,
    borderRadius: 20,
    backgroundColor: '#FFF9EC',
  },
  cameraPermissionTitle: {
    color: '#3E2A46',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  cameraPermissionText: {
    color: '#6F5B4B',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  cameraActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cameraGhostButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#FFF9EC',
  },
  cameraGhostText: {
    color: '#3E2A46',
    fontSize: 14,
    fontWeight: '900',
  },
  cameraCaptureButton: {
    minHeight: 48,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#E85D75',
  },
});
