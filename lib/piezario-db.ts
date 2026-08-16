import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { normalizeEmail } from './validation-schemas';

const DATABASE_NAME = 'piezario.db';

export type UserSession = {
  id: string;
  email: string;
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
  password_hash: string;
  password_salt: string;
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

let databasePromise: Promise<SQLiteDatabase> | null = null;

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabase();
  }

  return databasePromise;
}

async function openDatabase() {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  await db.execAsync(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
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
CREATE INDEX IF NOT EXISTS todos_user_updated_idx ON todos(user_id, updated_at DESC);
`);
  await ensureTodoOptionalColumns(db);
  return db;
}

async function ensureTodoOptionalColumns(db: SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(todos)');
  const columnTypesByName: Record<string, string> = {
    photo_uri: 'TEXT',
    location_latitude: 'REAL',
    location_longitude: 'REAL',
  };

  for (const [columnName, columnType] of Object.entries(columnTypesByName)) {
    if (!columns.some((column) => column.name === columnName)) {
      await db.execAsync(`ALTER TABLE todos ADD COLUMN ${columnName} ${columnType};`);
    }
  }
}


export async function registerUser(email: string, password: string): Promise<AuthResult> {
  const db = await getDatabase();
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM users WHERE email = ?',
    normalizedEmail
  );

  if (existingUser) {
    return { ok: false, message: 'Ese correo ya tiene cuenta. Inicia sesión.' };
  }

  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  const salt = Crypto.randomUUID();
  const passwordHash = await hashPassword(normalizedEmail, password, salt);

  await db.runAsync(
    'INSERT INTO users (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    normalizedEmail,
    passwordHash,
    salt,
    now
  );

  const session = { id, email: normalizedEmail };
  await saveSession(session);

  return { ok: true, session };
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const db = await getDatabase();
  const normalizedEmail = normalizeEmail(email);
  const user = await db.getFirstAsync<UserRow>(
    'SELECT id, email, password_hash, password_salt FROM users WHERE email = ?',
    normalizedEmail
  );

  if (!user) {
    return { ok: false, message: 'No encontramos esa cuenta. Regístrate primero.' };
  }

  const passwordHash = await hashPassword(user.email, password, user.password_salt);

  if (passwordHash !== user.password_hash) {
    return { ok: false, message: 'La contraseña no encaja con ese correo.' };
  }

  const session = { id: user.id, email: user.email };
  await saveSession(session);

  return { ok: true, session };
}

export async function loadSession(): Promise<UserSession | null> {
  const db = await getDatabase();
  const session = await db.getFirstAsync<UserSession>(`
SELECT users.id AS id, users.email AS email
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
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO sessions (id, user_id, email, updated_at) VALUES (1, ?, ?, ?)',
    session.id,
    session.email,
    new Date().toISOString()
  );
}

export async function clearSession() {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM sessions WHERE id = 1');
}

export async function listTodos(userId: string): Promise<TodoItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TodoRow>(
    'SELECT id, user_id, title, completed, photo_uri, location_latitude, location_longitude, created_at, updated_at FROM todos WHERE user_id = ? ORDER BY created_at DESC',
    userId
  );

  return rows.map(toTodoItem);
}

export async function createTodo(userId: string, title: string, photoUri: string | null = null): Promise<TodoItem> {
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
