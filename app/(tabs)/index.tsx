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
  importJsonPlaceholderTodos,
  listTodos,
  loadSession,
  loginUser,
  registerUser,
  renameTodo,
  setTodoCompleted,
  setTodoPhoto,
  setTodoLocation,
  syncTodosWithRemote,
  type TodoItem,
  type UserSession,
} from '@/lib/alisto-db';
import { loginSchema, registrationSchema, todoTitleSchema } from '@/lib/validation-schemas';

type AuthMode = 'login' | 'register';
type ActiveView = 'welcome' | 'todos';
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

export default function AlistoApp() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [activeView, setActiveView] = useState<ActiveView>('welcome');
  const [name, setName] = useState('');
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
  const [remoteAction, setRemoteAction] = useState<'sync' | 'import' | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const todoInputRef = useRef<TextInput>(null);
  const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
  const [cameraTodoId, setCameraTodoId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isLocatingTodoId, setIsLocatingTodoId] = useState<string | null>(null);
  const [todoPendingDeletion, setTodoPendingDeletion] = useState<TodoItem | null>(null);

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
        setActiveView('welcome');
      } catch {
        if (isMounted) {
          setFeedback({ tone: 'error', message: 'No pudimos cargar tus pendientes guardados.' });
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
    setActiveView('welcome');
    setTodos(userTodos);
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setNewTodoTitle('');
    setEditingTodoId(null);
    setTodoPendingDeletion(null);
    setEditingTitle('');
    setFeedback({ tone: 'success', message });
  };

  const handleLogin = async () => {
    const validation = loginSchema.safeParse({ email, password });

    if (!validation.success) {
      setFeedback({ tone: 'error', message: validation.error.issues[0]?.message ?? 'Revisa tus datos para continuar.' });
      return;
    }

    setIsBusy(true);

    try {
      const result = await loginUser(validation.data.email, validation.data.password);

      if (!result.ok) {
        setFeedback({ tone: 'error', message: result.message });
        return;
      }

      await activateSession(result.session, `Sesión iniciada: ${result.session.name}.`);
    } catch (error) {
      console.error('Login failed', error);
      setFeedback({ tone: 'error', message: 'No pudimos iniciar sesión. Inténtalo de nuevo.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRegister = async () => {
    const validation = registrationSchema.safeParse({ name, email, password, confirmPassword });

    if (!validation.success) {
      setFeedback({ tone: 'error', message: validation.error.issues[0]?.message ?? 'Revisa los datos de registro.' });
      return;
    }

    setIsBusy(true);

    try {
      const result = await registerUser(validation.data.name, validation.data.email, validation.data.password);

      if (!result.ok) {
        setFeedback({ tone: 'error', message: result.message });
        return;
      }

      setAuthMode('login');
      setName('');
      setEmail(result.account.email);
      setPassword('');
      setConfirmPassword('');
      setFeedback({ tone: 'success', message: 'Cuenta creada. Inicia sesión para acceder a tu sesión.' });
    } catch (error) {
      console.error('Registration failed', error);
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
      setActiveView('welcome');
      setTodoPendingDeletion(null);
      setAuthMode('login');
      setFeedback({ tone: 'success', message: 'Sesión cerrada. Tus pendientes siguen guardados.' });
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
      setFeedback({ tone: 'success', message: 'Pendiente añadido a la lista.' });
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos guardar el pendiente.' });
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
        message: nextCompleted ? 'Pendiente completado.' : 'Pendiente marcado como activo.',
      });
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos actualizar el pendiente.' });
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
      setFeedback({ tone: 'error', message: validation.error.issues[0]?.message ?? 'El pendiente no puede estar vacío.' });
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
      setFeedback({ tone: 'success', message: 'Pendiente renombrado.' });
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos editar el pendiente.' });
    } finally {
      setIsBusy(false);
    }
  };

  const deleteTodoAfterConfirmation = async (todo: TodoItem) => {
    if (!session) {
      return;
    }

    setIsBusy(true);

    try {
      await deleteTodo(session.id, todo.id);
      setTodos((currentTodos) => currentTodos.filter((currentTodo) => currentTodo.id !== todo.id));
      setFeedback({ tone: 'success', message: 'Pendiente eliminado de la lista.' });
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos eliminar el pendiente.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteTodo = (todo: TodoItem) => {
    setTodoPendingDeletion(todo);
  };

  const cancelDeleteTodo = () => {
    if (isBusy) {
      return;
    }

    setTodoPendingDeletion(null);
  };

  const confirmDeleteTodo = () => {
    if (!todoPendingDeletion) {
      return;
    }

    const todo = todoPendingDeletion;
    setTodoPendingDeletion(null);
    void deleteTodoAfterConfirmation(todo);
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
        setFeedback({ tone: 'error', message: 'Activa la ubicación para añadir coordenadas al pendiente.' });
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
            ? 'Últimas coordenadas disponibles guardadas en el pendiente.'
            : 'Coordenadas guardadas en el pendiente.',
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
        setFeedback({ tone: 'error', message: 'Activa la cámara para añadir una foto al pendiente.' });
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
      setFeedback({ tone: 'success', message: 'Foto guardada en el pendiente.' });
      setIsCameraOpen(false);
      setCameraTodoId(null);
      setIsCameraReady(false);
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos guardar la foto.' });
    } finally {
      setIsTakingPhoto(false);
    }
  };


  const startCreatingTodo = () => {
    setActiveView('todos');
    setFeedback(null);
    setTimeout(() => todoInputRef.current?.focus(), 0);
  };

  const refreshTodos = async (userId: string) => {
    const refreshedTodos = await listTodos(userId);
    setTodos(refreshedTodos);
  };

  const handleSyncRemoteTodos = async () => {
    if (!session) {
      return;
    }

    setIsBusy(true);
    setRemoteAction('sync');

    try {
      const result = await syncTodosWithRemote(session.id);
      await refreshTodos(session.id);
      setFeedback({
        tone: 'success',
        message: `API sincronizada: ${result.pushed} enviados, ${result.pulled} recibidos, ${result.deleted} eliminados.`,
      });
    } catch {
      setFeedback({
        tone: 'error',
        message: 'Sin conexión con la API. Tus pendientes locales siguen disponibles.',
      });
    } finally {
      setRemoteAction(null);
      setIsBusy(false);
    }
  };

  const handleImportJsonPlaceholderTodos = async () => {
    if (!session) {
      return;
    }

    setIsBusy(true);
    setRemoteAction('import');

    try {
      const result = await importJsonPlaceholderTodos(session.id);
      await refreshTodos(session.id);
      setFeedback({
        tone: 'success',
        message: `Importación lista: ${result.imported} nuevos, ${result.skipped} duplicados, ${result.total} revisados.`,
      });
    } catch {
      setFeedback({
        tone: 'error',
        message: 'No pudimos importar desde JSONPlaceholder. La lista local no se modificó.',
      });
    } finally {
      setRemoteAction(null);
      setIsBusy(false);
    }
  };

  const switchAuthMode = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setName('');
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
          <ActivityIndicator color="#275C5A" size="large" />
          <Text style={styles.loadingText}>Preparando tu lista...</Text>
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
        {session ? (activeView === 'todos' ? renderTodoBoard(session) : renderWelcomePanel(session)) : renderAuthPanel()}
      </ScrollView>
      {renderCameraModal()}
      {renderDeleteConfirmationModal()}
    </KeyboardAvoidingView>
  );

  function renderAuthPanel() {
    const isRegisterMode = authMode === 'register';

    return (
      <View style={styles.panel}>
        {renderLogoLockup()}

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Acceso privado</Text>
          <Text style={styles.title}>Ordena lo pendiente con calma.</Text>
          <Text style={styles.subtitle}>
            Alisto reúne tus tareas, fotos y ubicaciones en una lista clara para el día.
          </Text>
        </View>

        <View style={styles.form}>
          {isRegisterMode ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                accessibilityLabel="Nombre"
                autoCapitalize="words"
                autoComplete="name"
                autoCorrect={false}
                editable={!isBusy}
                onChangeText={setName}
                placeholder="Tu nombre"
                placeholderTextColor="#7F8A86"
                returnKeyType="next"
                style={styles.input}
                textContentType="name"
                value={name}
              />
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Correo</Text>
            <TextInput
              accessibilityLabel="Correo"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!isBusy}
              inputMode="text"
              onChangeText={setEmail}
              placeholder="nombre@correo.com"
              placeholderTextColor="#7F8A86"
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
                placeholderTextColor="#7F8A86"
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
                placeholderTextColor="#7F8A86"
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
            <Text style={styles.buttonText}>{isRegisterMode ? 'Crear cuenta' : 'Entrar a Alisto'}</Text>
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

  function renderWelcomePanel(activeSession: UserSession) {
    const pendingTodos = todos.filter((todo) => !todo.completed);
    const completedTodos = todos.filter((todo) => todo.completed);
    const totalTodos = todos.length;
    const summaryText =
      totalTodos === 0
        ? 'Aún no tienes pendientes. Crea el primero para organizar tu día.'
        : `${pendingTodos.length} pendientes y ${completedTodos.length} completadas.`;

    return (
      <View style={[styles.panel, styles.welcomePanel]}>
        {renderLogoLockup()}

        <View style={styles.welcomeHero}>
          <View style={styles.copy}>
            <Text style={styles.eyebrow}>Resumen del día</Text>
            <Text style={styles.title}>Bienvenido, {activeSession.name}</Text>
            <Text style={styles.subtitle}>{summaryText}</Text>
          </View>

          <View style={styles.summaryMosaic} accessibilityLabel="Resumen de pendientes">
            <View style={[styles.summaryPiece, styles.summaryPiecePending]}>
              <Text style={styles.summaryNumber}>{pendingTodos.length}</Text>
              <Text style={styles.summaryLabel}>Pendientes</Text>
            </View>
            <View style={[styles.summaryPiece, styles.summaryPieceCompleted]}>
              <Text style={styles.summaryNumber}>{completedTodos.length}</Text>
              <Text style={styles.summaryLabel}>Completadas</Text>
            </View>
          </View>
        </View>

        <View style={styles.summaryColumns}>
          <View style={styles.summaryColumn}>
            <Text style={styles.summaryColumnTitle}>Pendientes por hacer</Text>
            {pendingTodos.length === 0 ? (
              <Text style={styles.summaryEmptyText}>No quedan pendientes activos.</Text>
            ) : (
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={styles.summaryTaskList}
                contentContainerStyle={styles.summaryTaskListContent}>
                {pendingTodos.map((todo) => (
                  <Text key={todo.id} style={styles.summaryTaskText}>• {todo.title}</Text>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.summaryColumn}>
            <Text style={styles.summaryColumnTitle}>Tareas completadas</Text>
            {completedTodos.length === 0 ? (
              <Text style={styles.summaryEmptyText}>Completa una tarea para verla aquí.</Text>
            ) : (
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={styles.summaryTaskList}
                contentContainerStyle={styles.summaryTaskListContent}>
                {completedTodos.map((todo) => (
                  <Text key={todo.id} style={styles.summaryTaskText}>• {todo.title}</Text>
                ))}
              </ScrollView>
            )}
          </View>
        </View>

        {renderFeedback()}

        <View style={styles.welcomeActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isBusy }}
            disabled={isBusy}
            onPress={startCreatingTodo}
            style={({ pressed }) => [
              styles.welcomePrimaryButton,
              pressed && styles.buttonPressed,
              isBusy && styles.disabledControl,
            ]}>
            <Text style={styles.buttonText}>Ver/crear pendiente</Text>
          </Pressable>
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
      </View>
    );
  }

  function renderTodoBoard(activeSession: UserSession) {
    return (
      <View style={[styles.panel, styles.boardPanel]}>
        {renderLogoLockup()}

        <View style={styles.boardHeader}>
          <View style={styles.copy}>
            <Text style={styles.eyebrow}>Lista de pendientes</Text>
            <Text style={styles.title}>Hola, {activeSession.name}</Text>
            <Text style={styles.subtitle}>Tus pendientes están guardados en este dispositivo.</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
              disabled={isBusy}
              onPress={() => setActiveView('welcome')}
              style={({ pressed }) => [
                styles.logoutButton,
                pressed && styles.logoutButtonPressed,
                isBusy && styles.disabledControl,
              ]}>
              <Text style={styles.logoutText}>Resumen</Text>
            </Pressable>
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
        </View>

        <View style={styles.todoComposer}>
          <Text style={styles.label}>Nuevo pendiente</Text>
          <View style={styles.todoInputRow}>
            <TextInput
              ref={todoInputRef}
              accessibilityLabel="Nuevo pendiente"
              editable={!isBusy}
              onChangeText={setNewTodoTitle}
              placeholder="Ej. Comprar material para clase"
              placeholderTextColor="#7F8A86"
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
              <Text style={styles.buttonText}>Añadir pendiente</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.remotePanel}>
          <View style={styles.remoteCopy}>
            <Text style={styles.remoteTitle}>Integración API</Text>
            <Text style={styles.remoteText}>
              Sincroniza MockAPI o importa pendientes públicos sin perder el modo offline.
            </Text>
          </View>
          <View style={styles.remoteActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
              disabled={isBusy}
              onPress={handleSyncRemoteTodos}
              style={({ pressed }) => [
                styles.syncButton,
                pressed && styles.actionButtonPressed,
                isBusy && styles.disabledControl,
              ]}>
              <Text style={styles.syncButtonText}>
                {remoteAction === 'sync' ? 'Sincronizando...' : 'Sincronizar API'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
              disabled={isBusy}
              onPress={handleImportJsonPlaceholderTodos}
              style={({ pressed }) => [
                styles.importButton,
                pressed && styles.actionButtonPressed,
                isBusy && styles.disabledControl,
              ]}>
              <Text style={styles.importButtonText}>
                {remoteAction === 'import' ? 'Importando...' : 'Importar JSONPlaceholder'}
              </Text>
            </Pressable>
          </View>
        </View>

        {renderFeedback()}

        <View style={styles.todoList}>
          {todos.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyPiece} />
              <Text style={styles.emptyTitle}>Tu lista está en blanco.</Text>
              <Text style={styles.emptyText}>Añade el primer pendiente para verlo aquí.</Text>
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
              placeholder="Nombre del pendiente"
              placeholderTextColor="#7F8A86"
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
                accessibilityLabel={`${todo.photoUri ? 'Cambiar foto de' : 'Añadir foto a'} ${todo.title}`}
                accessibilityRole="button"
                disabled={isBusy || isTakingPhoto}
                onPress={() => openCameraForTodo(todo)}
                style={({ pressed }) => [styles.photoActionButton, pressed && styles.actionButtonPressed]}>
                <Text style={styles.photoActionText}>{todo.photoUri ? 'Cambiar foto' : 'Añadir foto'}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`${todo.locationLatitude !== null ? 'Actualizar ubicación de' : 'Añadir ubicación a'} ${todo.title}`}
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

  function renderDeleteConfirmationModal() {
    if (!todoPendingDeletion) {
      return null;
    }

    return (
      <Modal animationType="fade" onRequestClose={cancelDeleteTodo} transparent visible>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmPanel}>
            <Text style={styles.confirmTitle}>Eliminar pendiente</Text>
            <Text style={styles.confirmText}>
              {`¿Quieres eliminar "${todoPendingDeletion.title}"? Esta acción no se puede deshacer.`}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                accessibilityLabel="Cancelar eliminación"
                accessibilityRole="button"
                disabled={isBusy}
                onPress={cancelDeleteTodo}
                style={({ pressed }) => [
                  styles.confirmCancelButton,
                  pressed && styles.actionButtonPressed,
                  isBusy && styles.disabledControl,
                ]}>
                <Text style={styles.confirmCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Confirmar eliminación"
                accessibilityRole="button"
                disabled={isBusy}
                onPress={confirmDeleteTodo}
                style={({ pressed }) => [
                  styles.confirmDeleteButton,
                  pressed && styles.deleteButtonPressed,
                  isBusy && styles.disabledControl,
                ]}>
                <Text style={styles.deleteText}>Eliminar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
                  Activa la cámara para tomar una foto y guardarla en este pendiente.
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
      <View style={styles.logoLockup} accessibilityLabel="Logo de Alisto">
        <View style={styles.logoMark}>
          <View style={styles.logoListDot} />
          <View style={styles.logoListLine} />
          <View style={[styles.logoListDot, styles.logoListDotSecond]} />
          <View style={[styles.logoListLine, styles.logoListLineSecond]} />
          <View style={styles.logoCheckShort} />
          <View style={styles.logoCheckLong} />
        </View>
        <View>
          <Text style={styles.logoName}>Alisto</Text>
          <Text style={styles.logoTagline}>Pendientes en orden</Text>
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
          color="#275C5A"
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
    backgroundColor: '#EEF3EF',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 22,
  },
  cornerPiece: {
    position: 'absolute',
    top: -96,
    right: -88,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#DDE9E4',
  },
  floatingPiece: {
    position: 'absolute',
    left: -52,
    bottom: 74,
    width: 156,
    height: 156,
    borderRadius: 78,
    backgroundColor: '#F0DDC4',
  },
  boardGrid: {
    position: 'absolute',
    left: 26,
    right: 26,
    top: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    opacity: 0.62,
  },
  gridDot: {
    width: 1,
    height: 34,
    borderRadius: 1,
    backgroundColor: '#AAB9B2',
  },
  loadingPanel: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: '#D7E0DA',
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    shadowColor: '#183A37',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
    elevation: 8,
  },
  loadingText: {
    color: '#183A37',
    fontSize: 16,
    fontWeight: '800',
  },
  panel: {
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    gap: 28,
    padding: 28,
    borderWidth: 1,
    borderColor: '#D7E0DA',
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    shadowColor: '#183A37',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.14,
    shadowRadius: 34,
    elevation: 12,
  },
  boardPanel: {
    maxWidth: 900,
  },
  logoLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoMark: {
    position: 'relative',
    width: 68,
    height: 68,
    borderWidth: 1,
    borderColor: '#C8D5CF',
    borderRadius: 22,
    backgroundColor: '#F7FAF7',
  },
  logoListDot: {
    position: 'absolute',
    left: 14,
    top: 17,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#D89957',
  },
  logoListDotSecond: {
    top: 32,
  },
  logoListLine: {
    position: 'absolute',
    left: 26,
    top: 19,
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#9EB0A8',
  },
  logoListLineSecond: {
    top: 34,
    width: 18,
  },
  logoCheckShort: {
    position: 'absolute',
    left: 20,
    top: 44,
    width: 13,
    height: 5,
    borderRadius: 4,
    backgroundColor: '#275C5A',
    transform: [{ rotate: '42deg' }],
  },
  logoCheckLong: {
    position: 'absolute',
    left: 30,
    top: 39,
    width: 27,
    height: 5,
    borderRadius: 4,
    backgroundColor: '#275C5A',
    transform: [{ rotate: '-45deg' }],
  },
  logoName: {
    color: '#183A37',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  logoTagline: {
    marginTop: 2,
    color: '#63746E',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  copy: {
    gap: 10,
  },
  eyebrow: {
    color: '#B36F2F',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  title: {
    color: '#183A37',
    fontSize: 35,
    fontWeight: '900',
    lineHeight: 40,
    letterSpacing: -1.4,
  },
  subtitle: {
    color: '#5F706A',
    fontSize: 16,
    lineHeight: 24,
  },
  welcomePanel: {
    maxWidth: 760,
  },
  welcomeHero: {
    gap: 20,
  },
  summaryMosaic: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryPiece: {
    flex: 1,
    minHeight: 128,
    justifyContent: 'space-between',
    padding: 18,
    borderWidth: 1,
    borderRadius: 24,
  },
  summaryPiecePending: {
    borderColor: '#E7C491',
    backgroundColor: '#FFF3DF',
  },
  summaryPieceCompleted: {
    borderColor: '#9BD1B3',
    backgroundColor: '#EAF8F0',
  },
  summaryNumber: {
    color: '#183A37',
    fontSize: 44,
    fontWeight: '900',
    lineHeight: 48,
    letterSpacing: -1.6,
  },
  summaryLabel: {
    color: '#274640',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  summaryColumns: {
    gap: 12,
  },
  summaryColumn: {
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D7E0DA',
    borderRadius: 22,
    backgroundColor: '#F7FAF7',
  },
  welcomeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  welcomePrimaryButton: {
    minHeight: 56,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#275C5A',
  },
  summaryColumnTitle: {
    color: '#183A37',
    fontSize: 17,
    fontWeight: '900',
  },
  summaryTaskList: {
    maxHeight: 132,
  },
  summaryTaskListContent: {
    gap: 6,
    paddingRight: 8,
  },
  summaryTaskText: {
    color: '#465B54',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  summaryEmptyText: {
    color: '#63746E',
    fontSize: 15,
    lineHeight: 22,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  form: {
    gap: 18,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: '#274640',
    fontSize: 14,
    fontWeight: '900',
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#C8D5CF',
    borderRadius: 16,
    paddingHorizontal: 18,
    color: '#183A37',
    backgroundColor: '#FAFCFA',
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
    backgroundColor: '#E6EFEA',
  },
  button: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#275C5A',
  },
  buttonPressed: {
    transform: [{ translateY: 2 }],
    backgroundColor: '#1F4A48',
  },
  buttonText: {
    color: '#FFFFFF',
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
    borderWidth: 1,
    borderColor: '#D7E0DA',
    borderRadius: 16,
    backgroundColor: '#F7FAF7',
  },
  registerOptionPressed: {
    backgroundColor: '#EAF2EE',
  },
  registerPiece: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D89957',
  },
  registerCopy: {
    flex: 1,
    gap: 2,
  },
  registerQuestion: {
    color: '#63746E',
    fontSize: 13,
    fontWeight: '800',
  },
  registerAction: {
    color: '#183A37',
    fontSize: 15,
    fontWeight: '900',
  },
  status: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  statusError: {
    color: '#B42318',
  },
  statusSuccess: {
    color: '#237A57',
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
    borderWidth: 1,
    borderColor: '#C8D5CF',
    borderRadius: 14,
    backgroundColor: '#FAFCFA',
  },
  logoutButtonPressed: {
    backgroundColor: '#EAF2EE',
  },
  logoutText: {
    color: '#183A37',
    fontSize: 14,
    fontWeight: '900',
  },
  todoComposer: {
    gap: 10,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#D89957',
    borderRadius: 22,
    backgroundColor: '#F7FAF7',
  },
  remotePanel: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#C8D5CF',
    borderRadius: 22,
    backgroundColor: '#FAFCFA',
  },
  remoteCopy: {
    gap: 4,
  },
  remoteTitle: {
    color: '#183A37',
    fontSize: 17,
    fontWeight: '900',
  },
  remoteText: {
    color: '#63746E',
    fontSize: 14,
    lineHeight: 20,
  },
  remoteActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  syncButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#275C5A',
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  importButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#D89957',
    borderRadius: 14,
    backgroundColor: '#FFF3DF',
  },
  importButtonText: {
    color: '#183A37',
    fontSize: 13,
    fontWeight: '900',
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
    backgroundColor: '#275C5A',
  },
  todoList: {
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: '#C8D5CF',
    borderRadius: 22,
    backgroundColor: '#FAFCFA',
  },
  emptyPiece: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#D89957',
  },
  emptyTitle: {
    color: '#183A37',
    fontSize: 18,
    fontWeight: '900',
  },
  emptyText: {
    color: '#63746E',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  todoCard: {
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D7E0DA',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  todoCardCompleted: {
    borderColor: '#A8D8BE',
    backgroundColor: '#F4FBF7',
  },
  todoCheck: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#275C5A',
    borderRadius: 12,
    backgroundColor: '#FAFCFA',
  },
  todoCheckCompleted: {
    borderColor: '#237A57',
    backgroundColor: '#237A57',
  },
  todoCheckPressed: {
    transform: [{ scale: 0.95 }],
  },
  todoBody: {
    flex: 1,
    gap: 4,
  },
  todoTitle: {
    color: '#183A37',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 23,
  },
  todoTitleCompleted: {
    color: '#557068',
    textDecorationLine: 'line-through',
    opacity: 0.72,
  },
  todoMeta: {
    color: '#63746E',
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
    color: '#183A37',
    backgroundColor: '#E6EFEA',
    fontSize: 12,
    fontWeight: '900',
  },
  todoPhoto: {
    width: '100%',
    height: 180,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#C8D5CF',
    borderRadius: 18,
    backgroundColor: '#E6EFEA',
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
    backgroundColor: '#E6EFEA',
  },
  actionButtonPressed: {
    opacity: 0.76,
  },
  actionText: {
    color: '#183A37',
    fontSize: 13,
    fontWeight: '900',
  },
  photoActionButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#D89957',
  },
  photoActionText: {
    color: '#183A37',
    fontSize: 13,
    fontWeight: '900',
  },
  locationActionButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#275C5A',
  },
  locationActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  ghostActionButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F0DDC4',
  },
  ghostActionText: {
    color: '#183A37',
    fontSize: 13,
    fontWeight: '900',
  },
  deleteButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FBE8E6',
  },
  deleteButtonPressed: {
    backgroundColor: '#F6D2CE',
  },
  deleteText: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '900',
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
    backgroundColor: '#10232199',
  },
  confirmPanel: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: 16,
    padding: 22,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  confirmTitle: {
    color: '#183A37',
    fontSize: 22,
    fontWeight: '900',
  },
  confirmText: {
    color: '#63746E',
    fontSize: 15,
    lineHeight: 22,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmCancelButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#E6EFEA',
  },
  confirmCancelText: {
    color: '#183A37',
    fontSize: 14,
    fontWeight: '900',
  },
  confirmDeleteButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#FBE8E6',
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
    backgroundColor: '#102321D9',
  },
  cameraPanel: {
    maxWidth: 720,
    width: '100%',
    maxHeight: '92%',
    alignSelf: 'center',
    gap: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 28,
    backgroundColor: '#183A37',
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
    backgroundColor: '#FFFFFF',
  },
  cameraPermissionTitle: {
    color: '#183A37',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  cameraPermissionText: {
    color: '#63746E',
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
    backgroundColor: '#FFFFFF',
  },
  cameraGhostText: {
    color: '#183A37',
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
    backgroundColor: '#D89957',
  },
});
