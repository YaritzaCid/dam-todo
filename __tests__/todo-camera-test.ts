jest.mock('expo-camera', () => ({ CameraView: jest.fn(), useCameraPermissions: jest.fn() }));

const mockDirectoryCreate = jest.fn();
const mockFileCopy = jest.fn();

jest.mock('expo-file-system', () => ({
  Paths: { document: 'document://' },
  Directory: jest.fn().mockImplementation((base: string, name: string) => ({
    uri: `${base}${name}`,
    create: mockDirectoryCreate,
  })),
  File: jest.fn().mockImplementation((_sourceOrDirectory: unknown, fileName?: string) => {
    if (fileName) {
      return { uri: `document://todo-photos/${fileName}` };
    }

    return { copy: mockFileCopy };
  }),
}));

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { captureTodoPhoto, persistTodoPhotoUri, type TodoCamera } from '../lib/todo-camera';

describe('todo camera helpers', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    mockDirectoryCreate.mockClear();
    mockFileCopy.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('captura válida y persiste foto', async () => {
    const camera: TodoCamera = {
      takePictureAsync: jest.fn().mockResolvedValue({ uri: 'file://tmp/photo.jpg' }),
    };

    await expect(captureTodoPhoto(camera, 'todo-1')).resolves.toBe('document://todo-photos/todo-1-1234.jpg');
    expect(camera.takePictureAsync).toHaveBeenCalledWith({ quality: 0.82, skipProcessing: false });
    expect(mockDirectoryCreate).toHaveBeenCalledWith({ idempotent: true, intermediates: true });
    expect(mockFileCopy).toHaveBeenCalledWith({ uri: 'document://todo-photos/todo-1-1234.jpg' });
  });

  test('captura sin URI lanza error', async () => {
    const camera: TodoCamera = {
      takePictureAsync: jest.fn().mockResolvedValue({}),
    };

    await expect(captureTodoPhoto(camera, 'todo-1')).rejects.toThrow('Camera returned no photo URI.');
    expect(mockFileCopy).not.toHaveBeenCalled();
  });

  test('persistencia conserva data URI sin copiar archivo', async () => {
    await expect(persistTodoPhotoUri('data:image/jpeg;base64,abc', 'todo-1')).resolves.toBe('data:image/jpeg;base64,abc');
    expect(mockDirectoryCreate).not.toHaveBeenCalled();
    expect(mockFileCopy).not.toHaveBeenCalled();
  });
});
