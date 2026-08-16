import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const TODO_PHOTO_DIRECTORY = 'todo-photos';
const TODO_PHOTO_OPTIONS = { quality: 0.82, skipProcessing: false };

type CapturedPhoto = { uri?: string | null } | null | undefined;

export type TodoCamera = {
  takePictureAsync(options: typeof TODO_PHOTO_OPTIONS): Promise<CapturedPhoto>;
};

export async function persistTodoPhotoUri(photoUri: string, todoId: string) {
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

export async function captureTodoPhoto(camera: TodoCamera, todoId: string) {
  const photo = await camera.takePictureAsync(TODO_PHOTO_OPTIONS);

  if (!photo?.uri) {
    throw new Error('Camera returned no photo URI.');
  }

  return persistTodoPhotoUri(photo.uri, todoId);
}
