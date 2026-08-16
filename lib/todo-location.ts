import * as Location from 'expo-location';
import { Platform } from 'react-native';

const LOCATION_REQUEST_TIMEOUT_MS = 12_000;
const LOCATION_LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;
const LOCATION_LAST_KNOWN_REQUIRED_ACCURACY_METERS = 5000;

export const LOCATION_FAILURE_MESSAGE = 'No pudimos obtener la ubicación.';
export const ANDROID_EMULATOR_LOCATION_FAILURE_MESSAGE =
  'No pudimos obtener la ubicación. En el emulador, activa Ubicación, fija una coordenada GPS ' +
  'y desactiva Google Location Accuracy si sigue fallando.';

export type TodoLocationFix = {
  location: Location.LocationObject;
  source: 'current' | 'last-known';
};

type TodoLocationApi = {
  Accuracy: {
    Balanced: Location.Accuracy;
    High: Location.Accuracy;
  };
  getCurrentPositionAsync(options: Location.LocationOptions): Promise<Location.LocationObject>;
  getLastKnownPositionAsync(options: Location.LocationLastKnownOptions): Promise<Location.LocationObject | null>;
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

export async function getTodoLocationFix(
  locationApi: TodoLocationApi = Location,
  platformOs: typeof Platform.OS = Platform.OS
): Promise<TodoLocationFix> {
  try {
    const location = await withTimeout(
      locationApi.getCurrentPositionAsync({
        accuracy: platformOs === 'android' ? locationApi.Accuracy.High : locationApi.Accuracy.Balanced,
      }),
      LOCATION_REQUEST_TIMEOUT_MS
    );

    return { location, source: 'current' };
  } catch (error) {
    const lastKnownLocation = await locationApi.getLastKnownPositionAsync({
      maxAge: LOCATION_LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: LOCATION_LAST_KNOWN_REQUIRED_ACCURACY_METERS,
    });

    if (lastKnownLocation) {
      return { location: lastKnownLocation, source: 'last-known' };
    }

    throw error;
  }
}
