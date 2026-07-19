/**
 * Persisted user preferences consumed by layout profile decisions.
 *
 * Storage is injectable so the preference contract remains testable outside a
 * browser. A missing or unavailable storage implementation falls back to the
 * documented defaults without preventing the game from starting.
 */

export const LAYOUT_PREFERENCE_STORAGE_KEYS = Object.freeze({
  SHOW_ONSCREEN_KEYBOARD_ON_DESKTOP: 'showOnscreenKeyboardOnDesktop'
});

export const DEFAULT_LAYOUT_PREFERENCES = Object.freeze({
  showOnscreenKeyboardOnDesktop: true
});

const SUPPORTED_PREFERENCES = new Set(
  Object.keys(DEFAULT_LAYOUT_PREFERENCES)
);

function getBrowserStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function getStorageKey(preference) {
  if (!SUPPORTED_PREFERENCES.has(preference)) {
    throw new TypeError(`Unknown layout preference: ${String(preference)}`);
  }

  if (preference === 'showOnscreenKeyboardOnDesktop') {
    return LAYOUT_PREFERENCE_STORAGE_KEYS.SHOW_ONSCREEN_KEYBOARD_ON_DESKTOP;
  }

  throw new TypeError(`Missing storage key for layout preference: ${preference}`);
}

function readBoolean(storage, key, fallback) {
  if (!storage || typeof storage.getItem !== 'function') return fallback;

  try {
    const storedValue = storage.getItem(key);
    if (storedValue === 'true') return true;
    if (storedValue === 'false') return false;
  } catch {
    // Storage can be blocked by browser privacy settings. Use the safe default.
  }

  return fallback;
}

/**
 * Read a complete immutable preference state.
 *
 * @param {{getItem:function(string): (string|null)}} [storage]
 * @returns {Readonly<{showOnscreenKeyboardOnDesktop:boolean}>}
 */
export function loadLayoutPreferences(storage = getBrowserStorage()) {
  return Object.freeze({
    showOnscreenKeyboardOnDesktop: readBoolean(
      storage,
      LAYOUT_PREFERENCE_STORAGE_KEYS.SHOW_ONSCREEN_KEYBOARD_ON_DESKTOP,
      DEFAULT_LAYOUT_PREFERENCES.showOnscreenKeyboardOnDesktop
    )
  });
}

/**
 * Validate and persist one layout preference.
 *
 * The boolean value is returned so callers can update their in-memory state
 * even when browser storage is unavailable.
 *
 * @param {string} preference
 * @param {boolean} value
 * @param {{setItem:function(string, string):void}} [storage]
 * @returns {boolean}
 */
export function persistLayoutPreference(
  preference,
  value,
  storage = getBrowserStorage()
) {
  const storageKey = getStorageKey(preference);
  if (typeof value !== 'boolean') {
    throw new TypeError(`Layout preference ${preference} must be a boolean`);
  }

  if (storage && typeof storage.setItem === 'function') {
    try {
      storage.setItem(storageKey, String(value));
    } catch {
      // Keep the current-session value usable when persistence is unavailable.
    }
  }

  return value;
}
