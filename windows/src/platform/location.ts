import { type Place, nearestCity } from "../core";

/**
 * Asks the computer where it is, through the web view's geolocation, which uses Windows' location
 * service. Resolves to the nearest of the built-in cities' names with the real coordinates, or
 * null if the user has said no, location is off, or nothing answers in time.
 */
export function locate(): Promise<Place | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        resolve({ name: nearestCity(coordinates).name, coordinates });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 10 * 60_000 },
    );
  });
}
