const mockRandomUUID = jest.fn();

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('expo-crypto', () => ({
  randomUUID: mockRandomUUID,
  digestStringAsync: jest.fn().mockResolvedValue('hash'),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

import * as Crypto from 'expo-crypto';
import { importJsonPlaceholderTodos, syncTodosWithRemote } from '../lib/alisto-db';

const webStoreKey = 'piezario.webStore.v1';
const remoteUrl = 'https://mockapi.test/todos';

type StoredValue = Record<string, string>;

type MockFetchInit = RequestInit & { body?: string };

function createLocalStorage() {
  const store: StoredValue = {};

  return {
    clear: jest.fn(() => {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    }),
    getItem: jest.fn((key: string) => store[key] ?? null),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function readStoredTodos() {
  const storedValue = globalThis.localStorage.getItem(webStoreKey);

  if (!storedValue) {
    throw new Error('Missing web store.');
  }

  return JSON.parse(storedValue) as {
    todos: Array<{ id: string; title: string }>;
    syncRecords: Array<{ localId: string; remoteId: string | null; deletedAt: string | null }>;
  };
}

describe('Alisto API sync on web storage', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_REMOTE_TODOS_URL = remoteUrl;
    mockRandomUUID.mockReset();
    mockRandomUUID.mockReturnValueOnce('import-1').mockReturnValueOnce('import-2').mockReturnValueOnce('import-3')
      .mockReturnValueOnce('import-4').mockReturnValueOnce('import-5');
    Object.defineProperty(Crypto, 'randomUUID', {
      configurable: true,
      value: mockRandomUUID,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createLocalStorage(),
    });
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('previene duplicados al importar JSONPlaceholder', async () => {
    const sourceTodos = Array.from({ length: 10 }, (_value, index) => ({
      id: index + 1,
      userId: 1,
      title: `todo ${index + 1}`,
      completed: false,
    }));
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(sourceTodos));

    await expect(importJsonPlaceholderTodos('user-1')).resolves.toEqual({ imported: 5, skipped: 0, total: 5 });
    await expect(importJsonPlaceholderTodos('user-1')).resolves.toEqual({ imported: 0, skipped: 5, total: 5 });

    expect(readStoredTodos().todos).toHaveLength(5);
  });

  test('sincroniza POST, PUT y DELETE sin reinsertar tarea eliminada', async () => {
    const remoteRecords = [
      {
        id: 'remote-existing',
        localId: 'local-existing',
        userId: 'user-1',
        title: 'old remote title',
        completed: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        photoUri: null,
        locationLatitude: null,
        locationLongitude: null,
        importSource: null,
        importExternalId: null,
      },
      {
        id: 'remote-deleted',
        localId: 'local-deleted',
        userId: 'user-1',
        title: 'deleted remote title',
        completed: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        photoUri: null,
        locationLatitude: null,
        locationLongitude: null,
        importSource: null,
        importExternalId: null,
      },
    ];
    const methods: string[] = [];
    globalThis.localStorage.setItem(webStoreKey, JSON.stringify({
      users: [],
      todos: [
        {
          id: 'local-new',
          userId: 'user-1',
          title: 'new local title',
          completed: false,
          createdAt: '2026-01-03T00:00:00.000Z',
          updatedAt: '2026-01-03T00:00:00.000Z',
          photoUri: null,
          locationLatitude: null,
          locationLongitude: null,
        },
        {
          id: 'local-existing',
          userId: 'user-1',
          title: 'new local title',
          completed: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-04T00:00:00.000Z',
          photoUri: null,
          locationLatitude: null,
          locationLongitude: null,
        },
      ],
      syncRecords: [
        {
          localId: 'local-existing',
          userId: 'user-1',
          remoteId: 'remote-existing',
          remoteSyncedAt: '2026-01-02T00:00:00.000Z',
          importSource: null,
          importExternalId: null,
          deletedAt: null,
        },
        {
          localId: 'local-deleted',
          userId: 'user-1',
          remoteId: 'remote-deleted',
          remoteSyncedAt: '2026-01-02T00:00:00.000Z',
          importSource: null,
          importExternalId: null,
          deletedAt: '2026-01-05T00:00:00.000Z',
        },
      ],
      sessionUserId: null,
    }));

    (global.fetch as jest.Mock).mockImplementation((input: string, init?: MockFetchInit) => {
      const method = init?.method ?? 'GET';
      methods.push(method);

      if (method === 'DELETE') {
        const remoteId = input.split('/').pop();
        const remoteIndex = remoteRecords.findIndex((record) => record.id === remoteId);
        remoteRecords.splice(remoteIndex, 1);
        return Promise.resolve(jsonResponse({ id: remoteId }));
      }

      if (method === 'GET') {
        return Promise.resolve(jsonResponse(remoteRecords));
      }

      if (method === 'PUT') {
        const remoteId = input.split('/').pop();
        const body = JSON.parse(init?.body ?? '{}');
        const remoteIndex = remoteRecords.findIndex((record) => record.id === remoteId);
        remoteRecords[remoteIndex] = { ...body, id: remoteId };
        return Promise.resolve(jsonResponse(remoteRecords[remoteIndex]));
      }

      const body = JSON.parse(init?.body ?? '{}');
      const createdRecord = { ...body, id: 'remote-new' };
      remoteRecords.push(createdRecord);
      return Promise.resolve(jsonResponse(createdRecord));
    });

    await expect(syncTodosWithRemote('user-1')).resolves.toEqual({ pushed: 2, pulled: 0, deleted: 1 });

    const storedTodos = readStoredTodos().todos;
    expect(methods[0]).toBe('DELETE');
    expect(methods[1]).toBe('GET');
    expect(methods).toEqual(expect.arrayContaining(['POST', 'PUT', 'DELETE']));
    expect(remoteRecords.some((record) => record.localId === 'local-deleted')).toBe(false);
    expect(storedTodos.some((todo) => todo.id === 'local-deleted')).toBe(false);
  });
});
