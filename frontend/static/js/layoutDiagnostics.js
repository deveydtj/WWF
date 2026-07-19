/**
 * Test-only layout diagnostics.
 *
 * The namespace is installed only when a browser harness sets
 * `window.__WORD_SQUAD_TEST_DIAGNOSTICS__ = true` before application startup.
 * Keeping collection pull-based avoids adding resize work or production logs.
 */

const DEBUG_NAMESPACE = '__wordSquadDebug';
const ENABLE_FLAG = '__WORD_SQUAD_TEST_DIAGNOSTICS__';

function serializeRect(element) {
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height
  };
}

function getLegacyPanelCapacity(profile) {
  if (profile.mode === 'phone') return 0;
  if (profile.mode === 'tablet') return profile.historyPopup ? 0 : 1;
  if (profile.mode === 'desktop') return profile.historyPopup ? 1 : 2;
  return 0;
}

function getVisualViewportMetrics() {
  const viewport = window.visualViewport;

  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    offsetTop: viewport?.offsetTop ?? 0,
    offsetLeft: viewport?.offsetLeft ?? 0,
    scale: viewport?.scale ?? 1
  };
}

/**
 * Capture current values rather than caching resize events. The profile getter
 * lets this baseline diagnostic continue working after the profile refactor.
 */
export function captureLayoutDiagnostics(getProfile) {
  const currentProfile = getProfile?.() || {};
  const panelCapacity = Number.isInteger(currentProfile.panelCapacity)
    ? currentProfile.panelCapacity
    : getLegacyPanelCapacity(currentProfile);

  return {
    profile: {
      ...currentProfile,
      panelCapacity
    },
    metrics: {
      boardBounds: serializeRect(document.getElementById('board')),
      keyboardBounds: serializeRect(document.getElementById('keyboard')),
      layoutViewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      visualViewport: getVisualViewportMetrics()
    }
  };
}

/**
 * Install a pull-based diagnostic API for opted-in test pages.
 *
 * @returns {boolean} whether the namespace was installed
 */
export function installLayoutDiagnostics(getProfile) {
  if (typeof window === 'undefined' || window[ENABLE_FLAG] !== true) {
    return false;
  }

  const namespace = window[DEBUG_NAMESPACE] || {};
  Object.defineProperty(namespace, 'layout', {
    configurable: true,
    enumerable: true,
    value: Object.freeze({
      getSnapshot: () => captureLayoutDiagnostics(getProfile)
    })
  });
  window[DEBUG_NAMESPACE] = namespace;
  return true;
}
