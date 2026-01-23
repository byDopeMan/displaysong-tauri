/**
 * LocalStorage Wrapper with error handling
 */

/**
 * Get item from localStorage
 */
export function getItem(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Failed to get ${key} from localStorage:`, e);
    return defaultValue;
  }
}

/**
 * Set item in localStorage
 */
export function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`Failed to set ${key} in localStorage:`, e);
    return false;
  }
}

/**
 * Get string from localStorage (no JSON parsing)
 */
export function getString(key, defaultValue = null) {
  try {
    return localStorage.getItem(key) || defaultValue;
  } catch (e) {
    console.error(`Failed to get ${key} from localStorage:`, e);
    return defaultValue;
  }
}

/**
 * Set string in localStorage (no JSON encoding)
 */
export function setString(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.error(`Failed to set ${key} in localStorage:`, e);
    return false;
  }
}

/**
 * Remove item from localStorage
 */
export function removeItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.error(`Failed to remove ${key} from localStorage:`, e);
    return false;
  }
}
