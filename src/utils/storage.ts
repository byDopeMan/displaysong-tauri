/**
 * LocalStorage Wrapper with error handling
 */

/** Get a JSON-parsed item; returns defaultValue on miss or parse error. */
export function getItem<T = unknown>(key: string, defaultValue: T | null = null): T | null {
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : defaultValue;
  } catch (e) {
    console.error(`Failed to get ${key} from localStorage:`, e);
    return defaultValue;
  }
}

/** Store a value as JSON. Returns whether it succeeded. */
export function setItem(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`Failed to set ${key} in localStorage:`, e);
    return false;
  }
}

/** Get a raw string (no JSON parsing). */
export function getString(key: string, defaultValue: string | null = null): string | null {
  try {
    return localStorage.getItem(key) || defaultValue;
  } catch (e) {
    console.error(`Failed to get ${key} from localStorage:`, e);
    return defaultValue;
  }
}

/** Store a raw string (no JSON encoding). */
export function setString(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.error(`Failed to set ${key} in localStorage:`, e);
    return false;
  }
}

/** Remove an item. */
export function removeItem(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.error(`Failed to remove ${key} from localStorage:`, e);
    return false;
  }
}
