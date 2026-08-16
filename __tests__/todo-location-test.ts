const mockGetCurrentPositionAsync = jest.fn();
const mockGetLastKnownPositionAsync = jest.fn();

jest.mock('expo-location', () => ({
  Accuracy: { High: 6, Balanced: 3 },
  getCurrentPositionAsync: mockGetCurrentPositionAsync,
  getLastKnownPositionAsync: mockGetLastKnownPositionAsync,
}));

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { getTodoLocationFix } from '../lib/todo-location';

const validLocation = { coords: { latitude: 40.4168, longitude: -3.7038 } };
const lastKnownLocation = { coords: { latitude: 41.3874, longitude: 2.1686 } };

const locationApi = {
  Accuracy: { High: 6, Balanced: 3 },
  getCurrentPositionAsync: mockGetCurrentPositionAsync,
  getLastKnownPositionAsync: mockGetLastKnownPositionAsync,
};

describe('todo location helper', () => {
  beforeEach(() => {
    mockGetCurrentPositionAsync.mockReset();
    mockGetLastKnownPositionAsync.mockReset();
  });

  test('devuelve ubicación válida actual', async () => {
    mockGetCurrentPositionAsync.mockResolvedValue(validLocation);

    await expect(getTodoLocationFix(locationApi, 'ios')).resolves.toEqual({ location: validLocation, source: 'current' });
    expect(mockGetCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 3 });
    expect(mockGetLastKnownPositionAsync).not.toHaveBeenCalled();
  });

  test('usa última ubicación conocida como fallback', async () => {
    mockGetCurrentPositionAsync.mockRejectedValue(new Error('GPS unavailable'));
    mockGetLastKnownPositionAsync.mockResolvedValue(lastKnownLocation);

    await expect(getTodoLocationFix(locationApi, 'ios')).resolves.toEqual({ location: lastKnownLocation, source: 'last-known' });
    expect(mockGetLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 600000, requiredAccuracy: 5000 });
  });

  test('lanza error cuando no hay ubicación', async () => {
    const error = new Error('GPS unavailable');
    mockGetCurrentPositionAsync.mockRejectedValue(error);
    mockGetLastKnownPositionAsync.mockResolvedValue(null);

    await expect(getTodoLocationFix(locationApi, 'ios')).rejects.toBe(error);
  });
});
