import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import {
  deleteRemoteTodo,
  fetchJsonPlaceholderTodos,
  fetchRemoteTodos,
  upsertRemoteTodo,
  type RemoteTodoRecord,
} from './remote-todo-api';
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

type WebSyncRecord = {
  localId: string;
  userId: string;
  remoteId: string | null;
  remoteSyncedAt: string | null;
  importSource: string | null;
  importExternalId: string | null;
  deletedAt: string | null;
};

type WebStore = {
  users: WebUser[];
  todos: TodoItem[];
  syncRecords: WebSyncRecord[];
  sessionUserId: string | null;
};

const emptyWebStore = (): WebStore => ({ users: [], todos: [], syncRecords: [], sessionUserId: null });

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
      syncRecords: Array.isArray(parsedValue.syncRecords) ? parsedValue.syncRecords : [],
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
  const syncRecord = store.syncRecords.find((record) => record.localId === todoId && record.userId === userId);

  if (syncRecord?.remoteId) {
    upsertWebSyncRecord(store, {
      ...syncRecord,
      deletedAt: new Date().toISOString(),
    });
  }

  store.todos = store.todos.filter((todo) => todo.id !== todoId || todo.userId !== userId);
  saveWebStore(store);
}

function upsertWebSyncRecord(store: WebStore, nextRecord: WebSyncRecord) {
  const recordIndex = store.syncRecords.findIndex(
    (record) => record.localId === nextRecord.localId && record.userId === nextRecord.userId
  );

  if (recordIndex >= 0) {
    store.syncRecords[recordIndex] = nextRecord;
  } else {
    store.syncRecords.push(nextRecord);
  }
}

function toTodoFromRemote(remoteTodo: RemoteTodoRecord): TodoItem {
  return {
    id: remoteTodo.localId,
    userId: remoteTodo.userId,
    title: remoteTodo.title,
    completed: remoteTodo.completed,
    createdAt: remoteTodo.createdAt,
    updatedAt: remoteTodo.updatedAt,
    photoUri: remoteTodo.photoUri,
    locationLatitude: remoteTodo.locationLatitude,
    locationLongitude: remoteTodo.locationLongitude,
  };
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
CREATE TABLE IF NOT EXISTS todo_sync (
  local_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  remote_id TEXT,
  remote_synced_at TEXT,
  import_source TEXT,
  import_external_id TEXT,
  deleted_at TEXT
);
`);
  await ensureDatabaseSchema(db);
  return db;
}

async function ensureDatabaseSchema(db: SQLiteDatabase) {
  await ensureUserOptionalColumns(db);
  await ensureSessionOptionalColumns(db);
  await ensureTodoOptionalColumns(db);
  await db.execAsync(`
CREATE TABLE IF NOT EXISTS todo_sync (
  local_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  remote_id TEXT,
  remote_synced_at TEXT,
  import_source TEXT,
  import_external_id TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS todos_user_updated_idx ON todos(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS todo_sync_user_idx ON todo_sync(user_id, remote_id, import_source, import_external_id);
`);
  await removeExcessJsonPlaceholderImports(db);
}

async function removeExcessJsonPlaceholderImports(db: SQLiteDatabase) {
  await db.execAsync(`
DELETE FROM todos
WHERE id IN (
  SELECT local_id
  FROM todo_sync
  WHERE import_source = 'jsonplaceholder'
    AND CAST(import_external_id AS INTEGER) > 5
);
DELETE FROM todo_sync
WHERE import_source = 'jsonplaceholder'
  AND CAST(import_external_id AS INTEGER) > 5;
`);
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
  const syncRecord = await db.getFirstAsync<TodoSyncRow>(
    'SELECT local_id, user_id, remote_id, remote_synced_at, import_source, import_external_id, deleted_at FROM todo_sync WHERE local_id = ? AND user_id = ?',
    todoId,
    userId
  );

  if (syncRecord?.remote_id) {
    await db.runAsync(
      `INSERT INTO todo_sync (local_id, user_id, remote_id, remote_synced_at, import_source, import_external_id, deleted_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(local_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      todoId,
      userId,
      syncRecord.remote_id,
      syncRecord.remote_synced_at,
      syncRecord.import_source,
      syncRecord.import_external_id,
      new Date().toISOString()
    );
  }

  await db.runAsync('DELETE FROM todos WHERE id = ? AND user_id = ?', todoId, userId);
}

type TodoSyncRow = {
  local_id: string;
  user_id: string;
  remote_id: string | null;
  remote_synced_at: string | null;
  import_source: string | null;
  import_external_id: string | null;
  deleted_at: string | null;
};

export type RemoteSyncResult = {
  pushed: number;
  pulled: number;
  deleted: number;
};

export type JsonPlaceholderImportResult = {
  imported: number;
  skipped: number;
  total: number;
};

async function listTodoSyncRows(db: SQLiteDatabase, userId: string) {
  return db.getAllAsync<TodoSyncRow>(
    'SELECT local_id, user_id, remote_id, remote_synced_at, import_source, import_external_id, deleted_at FROM todo_sync WHERE user_id = ?',
    userId
  );
}

async function upsertTodoSyncRow(db: SQLiteDatabase, row: TodoSyncRow) {
  await db.runAsync(
    `INSERT INTO todo_sync (local_id, user_id, remote_id, remote_synced_at, import_source, import_external_id, deleted_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(local_id) DO UPDATE SET
  user_id = excluded.user_id,
  remote_id = excluded.remote_id,
  remote_synced_at = excluded.remote_synced_at,
  import_source = excluded.import_source,
  import_external_id = excluded.import_external_id,
  deleted_at = excluded.deleted_at`,
    row.local_id,
    row.user_id,
    row.remote_id,
    row.remote_synced_at,
    row.import_source,
    row.import_external_id,
    row.deleted_at
  );
}

async function insertRemoteTodo(db: SQLiteDatabase, remoteTodo: RemoteTodoRecord) {
  await db.runAsync(
    `INSERT INTO todos (id, user_id, title, completed, photo_uri, location_latitude, location_longitude, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    remoteTodo.localId,
    remoteTodo.userId,
    remoteTodo.title,
    remoteTodo.completed ? 1 : 0,
    remoteTodo.photoUri,
    remoteTodo.locationLatitude,
    remoteTodo.locationLongitude,
    remoteTodo.createdAt,
    remoteTodo.updatedAt
  );
}

async function updateLocalTodoFromRemote(db: SQLiteDatabase, remoteTodo: RemoteTodoRecord) {
  await db.runAsync(
    `UPDATE todos
SET title = ?, completed = ?, photo_uri = ?, location_latitude = ?, location_longitude = ?, created_at = ?, updated_at = ?
WHERE id = ? AND user_id = ?`,
    remoteTodo.title,
    remoteTodo.completed ? 1 : 0,
    remoteTodo.photoUri,
    remoteTodo.locationLatitude,
    remoteTodo.locationLongitude,
    remoteTodo.createdAt,
    remoteTodo.updatedAt,
    remoteTodo.localId,
    remoteTodo.userId
  );
}

function isRemoteNewer(remoteTodo: RemoteTodoRecord, localTodo: TodoItem, syncRow: TodoSyncRow | null) {
  if (!syncRow?.remote_synced_at) {
    return false;
  }

  return remoteTodo.updatedAt > localTodo.updatedAt && localTodo.updatedAt <= syncRow.remote_synced_at;
}

function syncRowFromRemote(remoteTodo: RemoteTodoRecord): TodoSyncRow {
  return {
    local_id: remoteTodo.localId,
    user_id: remoteTodo.userId,
    remote_id: remoteTodo.id,
    remote_synced_at: new Date().toISOString(),
    import_source: remoteTodo.importSource,
    import_external_id: remoteTodo.importExternalId,
    deleted_at: null,
  };
}

async function syncWebTodosWithRemote(userId: string): Promise<RemoteSyncResult> {
  const store = loadWebStore();
  const remoteTodos = await fetchRemoteTodos(userId);
  const remoteById = new Map(remoteTodos.map((todo) => [todo.id, todo]));
  const remoteByLocalId = new Map(remoteTodos.map((todo) => [todo.localId, todo]));
  let pushed = 0;
  let pulled = 0;
  let deleted = 0;

  for (const syncRecord of store.syncRecords.filter((record) => record.userId === userId && record.deletedAt)) {
    if (syncRecord.remoteId) {
      await deleteRemoteTodo(syncRecord.remoteId);
      deleted += 1;
    }

    store.syncRecords = store.syncRecords.filter((record) => record.localId !== syncRecord.localId);
  }

  for (const localTodo of store.todos.filter((todo) => todo.userId === userId)) {
    const syncRecord = store.syncRecords.find((record) => record.localId === localTodo.id && record.userId === userId) ?? null;
    const remoteTodo = syncRecord?.remoteId ? remoteById.get(syncRecord.remoteId) : remoteByLocalId.get(localTodo.id);
    const nativeSyncRow = syncRecord ? {
      local_id: syncRecord.localId,
      user_id: syncRecord.userId,
      remote_id: syncRecord.remoteId,
      remote_synced_at: syncRecord.remoteSyncedAt,
      import_source: syncRecord.importSource,
      import_external_id: syncRecord.importExternalId,
      deleted_at: syncRecord.deletedAt,
    } : null;

    if (remoteTodo && isRemoteNewer(remoteTodo, localTodo, nativeSyncRow)) {
      const todoIndex = store.todos.findIndex((todo) => todo.id === localTodo.id && todo.userId === userId);
      store.todos[todoIndex] = toTodoFromRemote(remoteTodo);
      upsertWebSyncRecord(store, {
        localId: remoteTodo.localId,
        userId: remoteTodo.userId,
        remoteId: remoteTodo.id,
        remoteSyncedAt: new Date().toISOString(),
        importSource: remoteTodo.importSource,
        importExternalId: remoteTodo.importExternalId,
        deletedAt: null,
      });
      pulled += 1;
    } else {
      const syncedTodo = await upsertRemoteTodo(
        localTodo,
        remoteTodo?.id ?? syncRecord?.remoteId ?? null,
        syncRecord?.importSource ?? null,
        syncRecord?.importExternalId ?? null
      );
      upsertWebSyncRecord(store, {
        localId: localTodo.id,
        userId,
        remoteId: syncedTodo.id,
        remoteSyncedAt: new Date().toISOString(),
        importSource: syncedTodo.importSource,
        importExternalId: syncedTodo.importExternalId,
        deletedAt: null,
      });
      pushed += 1;
    }
  }

  const localIds = new Set(store.todos.filter((todo) => todo.userId === userId).map((todo) => todo.id));
  const importedKeys = new Set(
    store.syncRecords
      .filter((record) => record.userId === userId && record.importSource && record.importExternalId)
      .map((record) => `${record.importSource}:${record.importExternalId}`)
  );

  for (const remoteTodo of remoteTodos) {
    const importKey = remoteTodo.importSource && remoteTodo.importExternalId
      ? `${remoteTodo.importSource}:${remoteTodo.importExternalId}`
      : null;

    if (localIds.has(remoteTodo.localId) || (importKey && importedKeys.has(importKey))) {
      continue;
    }

    store.todos.push(toTodoFromRemote(remoteTodo));
    upsertWebSyncRecord(store, {
      localId: remoteTodo.localId,
      userId: remoteTodo.userId,
      remoteId: remoteTodo.id,
      remoteSyncedAt: new Date().toISOString(),
      importSource: remoteTodo.importSource,
      importExternalId: remoteTodo.importExternalId,
      deletedAt: null,
    });
    pulled += 1;
  }

  saveWebStore(store);
  return { pushed, pulled, deleted };
}

export async function syncTodosWithRemote(userId: string): Promise<RemoteSyncResult> {
  if (Platform.OS === 'web') {
    return syncWebTodosWithRemote(userId);
  }

  const db = await getDatabase();
  const localTodos = await listTodos(userId);
  const syncRows = await listTodoSyncRows(db, userId);
  const remoteTodos = await fetchRemoteTodos(userId);
  const remoteById = new Map(remoteTodos.map((todo) => [todo.id, todo]));
  const remoteByLocalId = new Map(remoteTodos.map((todo) => [todo.localId, todo]));
  const syncByLocalId = new Map(syncRows.map((row) => [row.local_id, row]));
  let pushed = 0;
  let pulled = 0;
  let deleted = 0;

  for (const syncRow of syncRows.filter((row) => row.deleted_at)) {
    if (syncRow.remote_id) {
      await deleteRemoteTodo(syncRow.remote_id);
      deleted += 1;
    }

    await db.runAsync('DELETE FROM todo_sync WHERE local_id = ? AND user_id = ?', syncRow.local_id, userId);
  }

  for (const localTodo of localTodos) {
    const syncRow = syncByLocalId.get(localTodo.id) ?? null;
    const remoteTodo = syncRow?.remote_id ? remoteById.get(syncRow.remote_id) : remoteByLocalId.get(localTodo.id);

    if (remoteTodo && isRemoteNewer(remoteTodo, localTodo, syncRow)) {
      await updateLocalTodoFromRemote(db, remoteTodo);
      await upsertTodoSyncRow(db, syncRowFromRemote(remoteTodo));
      pulled += 1;
    } else {
      const syncedTodo = await upsertRemoteTodo(
        localTodo,
        remoteTodo?.id ?? syncRow?.remote_id ?? null,
        syncRow?.import_source ?? null,
        syncRow?.import_external_id ?? null
      );
      await upsertTodoSyncRow(db, syncRowFromRemote(syncedTodo));
      pushed += 1;
    }
  }

  const localIds = new Set(localTodos.map((todo) => todo.id));
  const importedKeys = new Set(
    syncRows
      .filter((row) => row.import_source && row.import_external_id)
      .map((row) => `${row.import_source}:${row.import_external_id}`)
  );

  for (const remoteTodo of remoteTodos) {
    const importKey = remoteTodo.importSource && remoteTodo.importExternalId
      ? `${remoteTodo.importSource}:${remoteTodo.importExternalId}`
      : null;

    if (localIds.has(remoteTodo.localId) || (importKey && importedKeys.has(importKey))) {
      continue;
    }

    await insertRemoteTodo(db, remoteTodo);
    await upsertTodoSyncRow(db, syncRowFromRemote(remoteTodo));
    pulled += 1;
  }

  return { pushed, pulled, deleted };
}

async function importJsonPlaceholderTodosWeb(userId: string): Promise<JsonPlaceholderImportResult> {
  const importedTodos = await fetchJsonPlaceholderTodos();
  const store = loadWebStore();
  const importedKeys = new Set(
    store.syncRecords
      .filter((record) => record.userId === userId && record.importSource === 'jsonplaceholder')
      .map((record) => record.importExternalId)
  );
  let imported = 0;
  let skipped = 0;

  for (const importedTodo of importedTodos) {
    const externalId = String(importedTodo.id);

    if (importedKeys.has(externalId)) {
      skipped += 1;
      continue;
    }

    const now = new Date().toISOString();
    const localId = Crypto.randomUUID();
    store.todos.push({
      id: localId,
      userId,
      title: importedTodo.title.trim(),
      completed: importedTodo.completed,
      createdAt: now,
      updatedAt: now,
      photoUri: null,
      locationLatitude: null,
      locationLongitude: null,
    });
    upsertWebSyncRecord(store, {
      localId,
      userId,
      remoteId: null,
      remoteSyncedAt: null,
      importSource: 'jsonplaceholder',
      importExternalId: externalId,
      deletedAt: null,
    });
    importedKeys.add(externalId);
    imported += 1;
  }

  saveWebStore(store);
  return { imported, skipped, total: importedTodos.length };
}

export async function importJsonPlaceholderTodos(userId: string): Promise<JsonPlaceholderImportResult> {
  if (Platform.OS === 'web') {
    return importJsonPlaceholderTodosWeb(userId);
  }

  const importedTodos = await fetchJsonPlaceholderTodos();
  const db = await getDatabase();
  const syncRows = await listTodoSyncRows(db, userId);
  const importedKeys = new Set(
    syncRows
      .filter((row) => row.import_source === 'jsonplaceholder')
      .map((row) => row.import_external_id)
  );
  let imported = 0;
  let skipped = 0;

  for (const importedTodo of importedTodos) {
    const externalId = String(importedTodo.id);

    if (importedKeys.has(externalId)) {
      skipped += 1;
      continue;
    }

    const now = new Date().toISOString();
    const localId = Crypto.randomUUID();
    await db.runAsync(
      `INSERT INTO todos (id, user_id, title, completed, photo_uri, location_latitude, location_longitude, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      localId,
      userId,
      importedTodo.title.trim(),
      importedTodo.completed ? 1 : 0,
      null,
      null,
      null,
      now,
      now
    );
    await upsertTodoSyncRow(db, {
      local_id: localId,
      user_id: userId,
      remote_id: null,
      remote_synced_at: null,
      import_source: 'jsonplaceholder',
      import_external_id: externalId,
      deleted_at: null,
    });
    importedKeys.add(externalId);
    imported += 1;
  }

  return { imported, skipped, total: importedTodos.length };
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
