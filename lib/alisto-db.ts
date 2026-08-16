import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { normalizeEmail } from './validation-schemas';

const DATABASE_NAME = 'piezario.db';

export type UserSession = {
  id: string;
  email: string;
  name: string;
};

export type TodoItem = {
  id: string;
  userId: string;
  title: string;
  completed: boolean;
  createdAt: string;
  photoUri: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  updatedAt: string;
};

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  password_hash: string | null;
  password_salt: string | null;
};

type TodoRow = {
  id: string;
  user_id: string;
  title: string;
  completed: number;
  created_at: string;
  updated_at: string;
  photo_uri: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
};

type AuthResult =
  | { ok: true; session: UserSession }
  | { ok: false; message: string };

type RegisterResult =
  | { ok: true; account: UserSession }
  | { ok: false; message: string };

const WEB_STORE_KEY = 'piezario.webStore.v1';

type WebUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  passwordSalt: string | null;
  createdAt: string;
};

type WebStore = {
  users: WebUser[];
  todos: TodoItem[];
  sessionUserId: string | null;
};

const emptyWebStore = (): WebStore => ({ users: [], todos: [], sessionUserId: null });

function loadWebStore(): WebStore {
  if (Platform.OS !== 'web' || typeof globalThis.localStorage === 'undefined') {
    return emptyWebStore();
  }

  const storedValue = globalThis.localStorage.getItem(WEB_STORE_KEY);

  if (!storedValue) {
    return emptyWebStore();
  }

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<WebStore>;

    return {
      users: Array.isArray(parsedValue.users) ? parsedValue.users : [],
      todos: Array.isArray(parsedValue.todos) ? parsedValue.todos : [],
      sessionUserId: typeof parsedValue.sessionUserId === 'string' ? parsedValue.sessionUserId : null,
    };
  } catch {
    return emptyWebStore();
  }
}

function saveWebStore(store: WebStore) {
  if (Platform.OS !== 'web' || typeof globalThis.localStorage === 'undefined') {
    return;
  }

  globalThis.localStorage.setItem(WEB_STORE_KEY, JSON.stringify(store));
}

function toWebSession(user: WebUser): UserSession {
  return { id: user.id, email: user.email, name: user.displayName || user.email };
}

async function registerWebUser(name: string, email: string, password: string): Promise<RegisterResult> {
  const store = loadWebStore();
  const normalizedEmail = normalizeEmail(email);
  const existingUserIndex = store.users.findIndex((user) => user.email === normalizedEmail);
  const existingUser = existingUserIndex >= 0 ? store.users[existingUserIndex] : null;

  if (existingUser?.passwordHash && existingUser.passwordSalt) {
    return { ok: false, message: 'Ese correo ya tiene cuenta. Inicia sesión.' };
  }

  const now = new Date().toISOString();
  const salt = Crypto.randomUUID();
  const passwordHash = await hashPassword(normalizedEmail, password, salt);
  const user: WebUser = {
    id: existingUser?.id ?? Crypto.randomUUID(),
    email: normalizedEmail,
    displayName: name,
    passwordHash,
    passwordSalt: salt,
    createdAt: existingUser?.createdAt ?? now,
  };

  if (existingUserIndex >= 0) {
    store.users[existingUserIndex] = user;
  } else {
    store.users.push(user);
  }

  saveWebStore(store);

  return { ok: true, account: toWebSession(user) };
}

async function loginWebUser(email: string, password: string): Promise<AuthResult> {
  const store = loadWebStore();
  const normalizedEmail = normalizeEmail(email);
  const user = store.users.find((storedUser) => storedUser.email === normalizedEmail);

  if (!user) {
    return { ok: false, message: 'No encontramos esa cuenta. Regístrate primero.' };
  }

  if (!user.passwordHash || !user.passwordSalt) {
    return { ok: false, message: 'Esta cuenta quedó incompleta. Crea la cuenta de nuevo.' };
  }

  const passwordHash = await hashPassword(user.email, password, user.passwordSalt);

  if (passwordHash !== user.passwordHash) {
    return { ok: false, message: 'La contraseña no coincide con ese correo.' };
  }

  store.sessionUserId = user.id;
  saveWebStore(store);

  return { ok: true, session: toWebSession(user) };
}

function loadWebSession(): UserSession | null {
  const store = loadWebStore();
  const user = store.users.find((storedUser) => storedUser.id === store.sessionUserId);
  return user ? toWebSession(user) : null;
}

function saveWebSession(session: UserSession) {
  const store = loadWebStore();
  store.sessionUserId = session.id;
  saveWebStore(store);
}

function clearWebSession() {
  const store = loadWebStore();
  store.sessionUserId = null;
  saveWebStore(store);
}

function listWebTodos(userId: string): TodoItem[] {
  const store = loadWebStore();
  return store.todos
    .filter((todo) => todo.userId === userId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function createWebTodo(userId: string, title: string, photoUri: string | null): TodoItem {
  const store = loadWebStore();
  const now = new Date().toISOString();
  const todo: TodoItem = {
    id: Crypto.randomUUID(),
    userId,
    title: title.trim(),
    completed: false,
    createdAt: now,
    updatedAt: now,
    photoUri,
    locationLatitude: null,
    locationLongitude: null,
  };

  store.todos.push(todo);
  saveWebStore(store);

  return todo;
}

function updateWebTodo(
  userId: string,
  todoId: string,
  applyUpdate: (todo: TodoItem, updatedAt: string) => TodoItem
) {
  const store = loadWebStore();
  const updatedAt = new Date().toISOString();
  const todoIndex = store.todos.findIndex((todo) => todo.id === todoId && todo.userId === userId);

  if (todoIndex >= 0) {
    store.todos[todoIndex] = applyUpdate(store.todos[todoIndex], updatedAt);
    saveWebStore(store);
  }

  return updatedAt;
}

function deleteWebTodo(userId: string, todoId: string) {
  const store = loadWebStore();
  store.todos = store.todos.filter((todo) => todo.id !== todoId || todo.userId !== userId);
  saveWebStore(store);
}

let databasePromise: Promise<SQLiteDatabase> | null = null;

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabase();
  }

  const db = await databasePromise;
  await ensureDatabaseSchema(db);
  return db;
}

async function openDatabase() {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  await db.execAsync(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  photo_uri TEXT,
  location_latitude REAL,
  location_longitude REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);
  await ensureDatabaseSchema(db);
  return db;
}

async function ensureDatabaseSchema(db: SQLiteDatabase) {
  await ensureUserOptionalColumns(db);
  await ensureSessionOptionalColumns(db);
  await ensureTodoOptionalColumns(db);
  await db.execAsync('CREATE INDEX IF NOT EXISTS todos_user_updated_idx ON todos(user_id, updated_at DESC);');
}

async function ensureUserOptionalColumns(db: SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(users)');
  const columnTypesByName: Record<string, string> = {
    display_name: 'TEXT',
    password_hash: 'TEXT',
    password_salt: 'TEXT',
    created_at: 'TEXT',
  };

  for (const [columnName, columnType] of Object.entries(columnTypesByName)) {
    if (!columns.some((column) => column.name === columnName)) {
      await db.execAsync(`ALTER TABLE users ADD COLUMN ${columnName} ${columnType};`);
    }
  }

  await db.runAsync("UPDATE users SET display_name = email WHERE display_name IS NULL OR display_name = ''");
}

async function ensureSessionOptionalColumns(db: SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sessions)');
  const columnTypesByName: Record<string, string> = {
    user_id: 'TEXT',
    email: 'TEXT',
    updated_at: 'TEXT',
  };

  for (const [columnName, columnType] of Object.entries(columnTypesByName)) {
    if (!columns.some((column) => column.name === columnName)) {
      await db.execAsync(`ALTER TABLE sessions ADD COLUMN ${columnName} ${columnType};`);
    }
  }
}

async function ensureTodoOptionalColumns(db: SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(todos)');
  const columnTypesByName: Record<string, string> = {
    user_id: 'TEXT',
    title: 'TEXT',
    completed: 'INTEGER DEFAULT 0',
    created_at: 'TEXT',
    updated_at: 'TEXT',
    photo_uri: 'TEXT',
    location_latitude: 'REAL',
    location_longitude: 'REAL',
  };

  for (const [columnName, columnType] of Object.entries(columnTypesByName)) {
    if (!columns.some((column) => column.name === columnName)) {
      await db.execAsync(`ALTER TABLE todos ADD COLUMN ${columnName} ${columnType};`);
    }
  }

  const now = new Date().toISOString();
  await db.runAsync("UPDATE todos SET title = 'Pendiente sin título' WHERE title IS NULL OR title = ''");
  await db.runAsync('UPDATE todos SET completed = 0 WHERE completed IS NULL');
  await db.runAsync('UPDATE todos SET created_at = ? WHERE created_at IS NULL', now);
  await db.runAsync('UPDATE todos SET updated_at = COALESCE(created_at, ?) WHERE updated_at IS NULL', now);
}


export async function registerUser(name: string, email: string, password: string): Promise<RegisterResult> {
  if (Platform.OS === 'web') {
    return registerWebUser(name, email, password);
  }
  const db = await getDatabase();
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await db.getFirstAsync<UserRow>(
    'SELECT id, email, display_name, password_hash, password_salt FROM users WHERE email = ?',
    normalizedEmail
  );

  if (existingUser?.password_hash && existingUser.password_salt) {
    return { ok: false, message: 'Ese correo ya tiene cuenta. Inicia sesión.' };
  }

  const now = new Date().toISOString();
  const id = existingUser?.id ?? Crypto.randomUUID();
  const salt = Crypto.randomUUID();
  const passwordHash = await hashPassword(normalizedEmail, password, salt);

  if (existingUser) {
    await db.runAsync(
      'UPDATE users SET display_name = ?, password_hash = ?, password_salt = ?, created_at = COALESCE(created_at, ?) WHERE id = ?',
      name,
      passwordHash,
      salt,
      now,
      id
    );
  } else {
    await db.runAsync(
      'INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      normalizedEmail,
      name,
      passwordHash,
      salt,
      now
    );
  }

  return { ok: true, account: { id, email: normalizedEmail, name } };
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  if (Platform.OS === 'web') {
    return loginWebUser(email, password);
  }
  const db = await getDatabase();
  const normalizedEmail = normalizeEmail(email);
  const user = await db.getFirstAsync<UserRow>(
    'SELECT id, email, display_name, password_hash, password_salt FROM users WHERE email = ?',
    normalizedEmail
  );

  if (!user) {
    return { ok: false, message: 'No encontramos esa cuenta. Regístrate primero.' };
  }

  if (!user.password_hash || !user.password_salt) {
    return { ok: false, message: 'Esta cuenta quedó incompleta. Crea la cuenta de nuevo.' };
  }

  const passwordHash = await hashPassword(user.email, password, user.password_salt);

  if (passwordHash !== user.password_hash) {
    return { ok: false, message: 'La contraseña no coincide con ese correo.' };
  }

  const session = { id: user.id, email: user.email, name: user.display_name || user.email };
  await saveSession(session);

  return { ok: true, session };
}

export async function loadSession(): Promise<UserSession | null> {
  if (Platform.OS === 'web') {
    return loadWebSession();
  }
  const db = await getDatabase();
  const session = await db.getFirstAsync<UserSession>(`
SELECT users.id AS id, users.email AS email, COALESCE(NULLIF(users.display_name, ''), users.email) AS name
FROM sessions
INNER JOIN users ON users.id = sessions.user_id
WHERE sessions.id = 1
`);

  if (!session) {
    return null;
  }

  return session;
}

export async function saveSession(session: UserSession) {
  if (Platform.OS === 'web') {
    saveWebSession(session);
    return;
  }
  const db = await getDatabase();
  const sessionColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sessions)');
  const sessionColumnNames = Object.fromEntries(sessionColumns.map((column) => [column.name, true]));
  const insertColumns = ['id', 'user_id'];
  const placeholders = ['?', '?'];
  const values: Array<number | string> = [1, session.id];

  if (sessionColumnNames.email) {
    insertColumns.push('email');
    placeholders.push('?');
    values.push(session.email);
  }

  if (sessionColumnNames.updated_at) {
    insertColumns.push('updated_at');
    placeholders.push('?');
    values.push(new Date().toISOString());
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO sessions (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    ...values
  );
}

export async function clearSession() {
  if (Platform.OS === 'web') {
    clearWebSession();
    return;
  }
  const db = await getDatabase();
  await db.runAsync('DELETE FROM sessions WHERE id = 1');
}

export async function listTodos(userId: string): Promise<TodoItem[]> {
  if (Platform.OS === 'web') {
    return listWebTodos(userId);
  }
  const db = await getDatabase();
  const rows = await db.getAllAsync<TodoRow>(
    'SELECT id, user_id, title, completed, photo_uri, location_latitude, location_longitude, created_at, updated_at FROM todos WHERE user_id = ? ORDER BY created_at DESC',
    userId
  );

  return rows.map(toTodoItem);
}

export async function createTodo(userId: string, title: string, photoUri: string | null = null): Promise<TodoItem> {
  if (Platform.OS === 'web') {
    return createWebTodo(userId, title, photoUri);
  }
  const db = await getDatabase();
  const now = new Date().toISOString();
  const todo: TodoItem = {
    id: Crypto.randomUUID(),
    userId,
    title: title.trim(),
    completed: false,
    createdAt: now,
    updatedAt: now,
    photoUri,
    locationLatitude: null,
    locationLongitude: null,
  };

  await db.runAsync(
    'INSERT INTO todos (id, user_id, title, completed, photo_uri, location_latitude, location_longitude, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    todo.id,
    todo.userId,
    todo.title,
    0,
    todo.photoUri,
    todo.locationLatitude,
    todo.locationLongitude,
    todo.createdAt,
    todo.updatedAt
  );

  return todo;
}

export async function setTodoCompleted(userId: string, todoId: string, completed: boolean) {
  if (Platform.OS === 'web') {
    return updateWebTodo(userId, todoId, (todo, updatedAt) => ({ ...todo, completed, updatedAt }));
  }
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.runAsync(
    'UPDATE todos SET completed = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    completed ? 1 : 0,
    updatedAt,
    todoId,
    userId
  );

  return updatedAt;
}

export async function renameTodo(userId: string, todoId: string, title: string) {
  if (Platform.OS === 'web') {
    return updateWebTodo(userId, todoId, (todo, updatedAt) => ({ ...todo, title: title.trim(), updatedAt }));
  }
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.runAsync(
    'UPDATE todos SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    title.trim(),
    updatedAt,
    todoId,
    userId
  );

  return updatedAt;
}

export async function setTodoPhoto(userId: string, todoId: string, photoUri: string) {
  if (Platform.OS === 'web') {
    return updateWebTodo(userId, todoId, (todo, updatedAt) => ({ ...todo, photoUri, updatedAt }));
  }
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.runAsync(
    'UPDATE todos SET photo_uri = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    photoUri,
    updatedAt,
    todoId,
    userId
  );

  return updatedAt;
}

export async function setTodoLocation(
  userId: string,
  todoId: string,
  latitude: number,
  longitude: number
) {
  if (Platform.OS === 'web') {
    return updateWebTodo(userId, todoId, (todo, updatedAt) => ({
      ...todo,
      locationLatitude: latitude,
      locationLongitude: longitude,
      updatedAt,
    }));
  }
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.runAsync(
    'UPDATE todos SET location_latitude = ?, location_longitude = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    latitude,
    longitude,
    updatedAt,
    todoId,
    userId
  );

  return updatedAt;
}

export async function deleteTodo(userId: string, todoId: string) {
  if (Platform.OS === 'web') {
    deleteWebTodo(userId, todoId);
    return;
  }
  const db = await getDatabase();
  await db.runAsync('DELETE FROM todos WHERE id = ? AND user_id = ?', todoId, userId);
}

async function hashPassword(email: string, password: string, salt: string) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${email}:${password}`
  );
}

function toTodoItem(row: TodoRow): TodoItem {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    completed: row.completed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoUri: row.photo_uri,
    locationLatitude: row.location_latitude,
    locationLongitude: row.location_longitude,
  };
}
