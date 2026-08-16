import type { TodoItem } from './alisto-db';

const JSONPLACEHOLDER_TODOS_URL = 'https://jsonplaceholder.typicode.com/todos';
const JSONPLACEHOLDER_IMPORT_LIMIT = 5;
const REQUEST_TIMEOUT_MS = 10_000;

export type RemoteTodoRecord = {
  id: string;
  localId: string;
  userId: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  photoUri: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  importSource: string | null;
  importExternalId: string | null;
};

export type JsonPlaceholderTodo = {
  id: number;
  userId: number;
  title: string;
  completed: boolean;
};

export type RemoteTodoApiErrorKind =
  | 'missing-url'
  | 'network'
  | 'timeout'
  | 'http'
  | 'invalid-response'
  | 'unexpected';

export class RemoteTodoApiError extends Error {
  readonly kind: RemoteTodoApiErrorKind;
  readonly status: number | null;
  readonly detail: unknown;

  constructor(kind: RemoteTodoApiErrorKind, message: string, options?: { status?: number; detail?: unknown }) {
    super(message);
    this.name = 'RemoteTodoApiError';
    this.kind = kind;
    this.status = options?.status ?? null;
    this.detail = options?.detail ?? null;
  }
}

export function getRemoteTodoApiUserMessage(error: unknown) {
  if (!(error instanceof RemoteTodoApiError)) {
    return 'No pudimos sincronizar. Inténtalo de nuevo.';
  }

  if (error.kind === 'missing-url') {
    return 'Falta configurar la URL de la API.';
  }

  if (error.kind === 'network' || error.kind === 'timeout') {
    return 'No pudimos conectar con la API. Tus pendientes locales siguen disponibles.';
  }

  if (error.kind === 'http') {
    return 'La API respondió con error. Inténtalo más tarde.';
  }

  if (error.kind === 'invalid-response') {
    return 'La API devolvió datos inválidos.';
  }

  return 'No pudimos sincronizar. Inténtalo de nuevo.';
}

async function readRemoteJson(response: Response, action: string) {
  try {
    return await response.json();
  } catch (error) {
    throw new RemoteTodoApiError('invalid-response', `${action} devolvió JSON inválido.`, { detail: error });
  }
}
type RemoteTodoBody = Omit<RemoteTodoRecord, 'id'>;

function getRemoteTodosUrl() {
  const remoteTodosUrl = process.env.EXPO_PUBLIC_REMOTE_TODOS_URL;

  if (!remoteTodosUrl) {
    throw new RemoteTodoApiError('missing-url', 'Falta EXPO_PUBLIC_REMOTE_TODOS_URL en .env.');
  }

  return remoteTodosUrl.replace(/\/$/, '');
}

async function fetchWithTimeout(input: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RemoteTodoApiError('timeout', 'La petición remota agotó el tiempo de espera.', { detail: error });
    }

    throw new RemoteTodoApiError('network', 'No se pudo conectar con la API remota.', { detail: error });
  } finally {
    clearTimeout(timeoutId);
  }
}

function assertOk(response: Response, action: string) {
  if (!response.ok) {
    throw new RemoteTodoApiError('http', `${action} falló con HTTP ${response.status}.`, {
      status: response.status,
      detail: response.statusText,
    });
  }
}


function normalizeNullableNumber(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeRemoteTodo(value: unknown): RemoteTodoRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const rawTodo = value as Record<string, unknown>;
  const id = typeof rawTodo.id === 'string' ? rawTodo.id : '';
  const localId = typeof rawTodo.localId === 'string' ? rawTodo.localId : '';
  const userId = typeof rawTodo.userId === 'string' ? rawTodo.userId : '';
  const title = (typeof rawTodo.title === 'string' ? rawTodo.title : '').trim();

  if (!id || !localId || !userId || !title) {
    return null;
  }

  const createdAt = (typeof rawTodo.createdAt === 'string' ? rawTodo.createdAt : '') || new Date().toISOString();
  const updatedAt = (typeof rawTodo.updatedAt === 'string' ? rawTodo.updatedAt : '') || createdAt;

  return {
    id,
    localId,
    userId,
    title,
    completed: rawTodo.completed === true || rawTodo.completed === 'true' || rawTodo.completed === 1,
    createdAt,
    updatedAt,
    photoUri: typeof rawTodo.photoUri === 'string' && rawTodo.photoUri.length > 0 ? rawTodo.photoUri : null,
    locationLatitude: normalizeNullableNumber(rawTodo.locationLatitude),
    locationLongitude: normalizeNullableNumber(rawTodo.locationLongitude),
    importSource: typeof rawTodo.importSource === 'string' && rawTodo.importSource.length > 0 ? rawTodo.importSource : null,
    importExternalId: typeof rawTodo.importExternalId === 'string' && rawTodo.importExternalId.length > 0 ? rawTodo.importExternalId : null,
  };
}

function toRemoteBody(todo: TodoItem, importSource: string | null, importExternalId: string | null): RemoteTodoBody {
  return {
    localId: todo.id,
    userId: todo.userId,
    title: todo.title,
    completed: todo.completed,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
    photoUri: todo.photoUri,
    locationLatitude: todo.locationLatitude,
    locationLongitude: todo.locationLongitude,
    importSource,
    importExternalId,
  };
}

export async function fetchRemoteTodos(userId: string) {
  const response = await fetchWithTimeout(getRemoteTodosUrl());
  assertOk(response, 'La lectura remota');
  const rawTodos = await readRemoteJson(response, 'La lectura remota');

  if (!Array.isArray(rawTodos)) {
    throw new RemoteTodoApiError('invalid-response', 'La lectura remota no devolvió una lista.');
  }

  return rawTodos
    .map(normalizeRemoteTodo)
    .filter((todo): todo is RemoteTodoRecord => todo !== null && todo.userId === userId);
}

export async function upsertRemoteTodo(
  todo: TodoItem,
  remoteId: string | null,
  importSource: string | null,
  importExternalId: string | null
) {
  const baseUrl = getRemoteTodosUrl();
  const body = JSON.stringify(toRemoteBody(todo, importSource, importExternalId));
  const response = await fetchWithTimeout(remoteId ? `${baseUrl}/${remoteId}` : baseUrl, {
    method: remoteId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  assertOk(response, remoteId ? 'La actualización remota' : 'La creación remota');
  const normalizedTodo = normalizeRemoteTodo(await readRemoteJson(response, 'La escritura remota'));

  if (!normalizedTodo) {
    throw new RemoteTodoApiError('invalid-response', 'La API remota devolvió un pendiente inválido.');
  }

  return normalizedTodo;
}

export async function deleteRemoteTodo(remoteId: string) {
  const response = await fetchWithTimeout(`${getRemoteTodosUrl()}/${remoteId}`, { method: 'DELETE' });
  assertOk(response, 'La eliminación remota');
}

export async function fetchJsonPlaceholderTodos() {
  const response = await fetchWithTimeout(JSONPLACEHOLDER_TODOS_URL);
  assertOk(response, 'La importación desde JSONPlaceholder');
  const rawTodos = await readRemoteJson(response, 'La importación desde JSONPlaceholder');

  if (!Array.isArray(rawTodos)) {
    throw new RemoteTodoApiError('invalid-response', 'JSONPlaceholder no devolvió una lista.');
  }

  return rawTodos
    .filter((todo): todo is JsonPlaceholderTodo => {
      if (!todo || typeof todo !== 'object') {
        return false;
      }

      const candidate = todo as Partial<JsonPlaceholderTodo>;
      return (
        typeof candidate.id === 'number' &&
        typeof candidate.userId === 'number' &&
        typeof candidate.title === 'string' &&
        typeof candidate.completed === 'boolean'
      );
    })
    .slice(0, JSONPLACEHOLDER_IMPORT_LIMIT);
}
