/**
 * Authoritative overlay state for panels and menu surfaces.
 *
 * CSS classes remain the rendering API for the current stylesheets, but this
 * module owns whether an overlay is open. Other modules should query and mutate
 * overlays here rather than reading or writing body classes directly.
 */

import { LAYOUT_MODES } from './layoutModes.js';
import { getCurrentLayoutState } from './layoutManager.js';

export const OVERLAYS = Object.freeze({
  HISTORY: 'history',
  DEFINITION: 'definition',
  CHAT: 'chat',
  PLAYERS: 'players',
  OPTIONS: 'options',
  MOBILE_MENU: 'mobileMenu'
});

const OVERLAY_DEFINITIONS = Object.freeze({
  [OVERLAYS.HISTORY]: {
    bodyClass: 'history-open',
    elementId: 'historyBox',
    elementClasses: ['active', 'visible']
  },
  [OVERLAYS.DEFINITION]: {
    bodyClass: 'definition-open',
    elementId: 'definitionBox',
    elementClasses: ['active', 'visible']
  },
  [OVERLAYS.CHAT]: {
    bodyClass: 'chat-open',
    elementId: 'chatBox',
    elementClasses: ['active', 'visible']
  },
  [OVERLAYS.PLAYERS]: {
    bodyClass: 'players-open',
    elementId: 'playerSidebar',
    elementClasses: ['visible']
  },
  [OVERLAYS.OPTIONS]: {
    elementId: 'optionsMenu',
    elementClasses: ['visible']
  },
  [OVERLAYS.MOBILE_MENU]: {
    elementId: 'mobileMenuPopup',
    elementClasses: ['visible', 'show']
  }
});

const CLASS_TO_OVERLAY = Object.freeze(
  Object.fromEntries(
    Object.entries(OVERLAY_DEFINITIONS)
      .filter(([, definition]) => definition.bodyClass)
      .map(([key, definition]) => [definition.bodyClass, key])
  )
);

const overlayState = Object.fromEntries(
  Object.values(OVERLAYS).map((key) => [key, false])
);

const manualOverlayState = {
  [OVERLAYS.HISTORY]: false,
  [OVERLAYS.DEFINITION]: false,
  [OVERLAYS.CHAT]: false
};

let initializedFromDom = false;
let lastActivatedOverlay = null;

function getBody() {
  return typeof document !== 'undefined' ? document.body : null;
}

function getOverlayElement(definition) {
  if (!definition?.elementId || typeof document === 'undefined') {
    return null;
  }

  return document.getElementById(definition.elementId);
}

function toggleClass(target, className, enabled) {
  if (target?.classList && typeof target.classList.toggle === 'function') {
    target.classList.toggle(className, enabled);
  }
}

function containsClass(target, className) {
  return Boolean(target?.classList && typeof target.classList.contains === 'function' && target.classList.contains(className));
}

function normalizeOverlayKey(keyOrClass) {
  if (OVERLAY_DEFINITIONS[keyOrClass]) {
    return keyOrClass;
  }

  return CLASS_TO_OVERLAY[keyOrClass] || null;
}

function overlayUsesExclusiveStack(key, layoutState = getCurrentLayoutState()) {
  const mode = layoutState.mode;

  if (key === OVERLAYS.HISTORY) {
    return mode === LAYOUT_MODES.PHONE || layoutState.historyPopup;
  }

  if ([OVERLAYS.DEFINITION, OVERLAYS.CHAT, OVERLAYS.PLAYERS].includes(key)) {
    return mode !== LAYOUT_MODES.DESKTOP || layoutState.historyPopup;
  }

  return key === OVERLAYS.OPTIONS || key === OVERLAYS.MOBILE_MENU;
}

function applyOverlayRender(key) {
  const definition = OVERLAY_DEFINITIONS[key];
  if (!definition) return;

  const isOpen = Boolean(overlayState[key]);
  const body = getBody();
  if (definition.bodyClass) {
    toggleClass(body, definition.bodyClass, isOpen);
  }

  const element = getOverlayElement(definition);
  if (element) {
    definition.elementClasses?.forEach((className) => {
      toggleClass(element, className, isOpen);
    });
    element.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }
}

function updateOverlayDataset() {
  const body = getBody();
  if (!body) return;

  const active = Object.entries(overlayState)
    .filter(([, open]) => open)
    .map(([key]) => key);

  if (body.dataset) {
    body.dataset.activeOverlays = active.join(' ');
  }
  toggleClass(body, 'overlay-open', active.length > 0);
}

function emitOverlayChange(key, previousOpen, open) {
  if (
    previousOpen === open ||
    typeof document === 'undefined' ||
    typeof CustomEvent === 'undefined'
  ) {
    return;
  }

  document.dispatchEvent(new CustomEvent('overlaychange', {
    detail: {
      overlay: key,
      open,
      activeOverlays: getOpenOverlays(),
      state: getOverlayState()
    }
  }));
}

function ensureInitializedFromDom() {
  if (initializedFromDom) return;

  const body = getBody();
  Object.entries(OVERLAY_DEFINITIONS).forEach(([key, definition]) => {
    const element = getOverlayElement(definition);
    overlayState[key] = Boolean(
      (definition.bodyClass && containsClass(body, definition.bodyClass)) ||
      containsClass(element, 'visible') ||
      containsClass(element, 'active') ||
      containsClass(element, 'show')
    );
    applyOverlayRender(key);
  });

  updateOverlayDataset();
  initializedFromDom = true;
}

function closeCompetingOverlays(openingKey, layoutState) {
  if (!overlayUsesExclusiveStack(openingKey, layoutState)) return;

  Object.keys(OVERLAY_DEFINITIONS).forEach((key) => {
    if (
      key !== openingKey &&
      overlayState[key] &&
      overlayUsesExclusiveStack(key, layoutState)
    ) {
      setOverlayOpen(key, false, {
        closeCompeting: false,
        dispatch: true
      });
    }
  });
}

export function getOverlayKeyFromClass(className) {
  return normalizeOverlayKey(className);
}

export function getOverlayState() {
  ensureInitializedFromDom();
  return { ...overlayState };
}

export function getOpenOverlays() {
  ensureInitializedFromDom();
  return Object.entries(overlayState)
    .filter(([, open]) => open)
    .map(([key]) => key);
}

export function isOverlayOpen(keyOrClass) {
  ensureInitializedFromDom();
  const key = normalizeOverlayKey(keyOrClass);
  return key ? Boolean(overlayState[key]) : false;
}

export function setOverlayOpen(keyOrClass, open, options = {}) {
  ensureInitializedFromDom();
  const key = normalizeOverlayKey(keyOrClass);
  if (!key) return false;

  const layoutState = options.layoutState || getCurrentLayoutState();
  if (open && options.closeCompeting !== false) {
    closeCompetingOverlays(key, layoutState);
  }

  const previousOpen = Boolean(overlayState[key]);
  overlayState[key] = Boolean(open);
  if (overlayState[key]) {
    lastActivatedOverlay = key;
  }

  applyOverlayRender(key);
  updateOverlayDataset();

  if (options.dispatch !== false) {
    emitOverlayChange(key, previousOpen, overlayState[key]);
  }

  return overlayState[key];
}

export function openOverlay(keyOrClass, options = {}) {
  return setOverlayOpen(keyOrClass, true, options);
}

export function closeOverlay(keyOrClass, options = {}) {
  return setOverlayOpen(keyOrClass, false, options);
}

export function toggleOverlay(keyOrClass, options = {}) {
  return setOverlayOpen(keyOrClass, !isOverlayOpen(keyOrClass), options);
}

export function setManualOverlayState(keyOrClass, value) {
  const key = normalizeOverlayKey(keyOrClass);
  if (key && Object.prototype.hasOwnProperty.call(manualOverlayState, key)) {
    manualOverlayState[key] = Boolean(value);
  }
}

export function getManualOverlayState(keyOrClass = null) {
  if (!keyOrClass) {
    return { ...manualOverlayState };
  }

  const key = normalizeOverlayKey(keyOrClass);
  return key ? Boolean(manualOverlayState[key]) : false;
}

export function refreshOverlayStateForLayout(layoutState = getCurrentLayoutState()) {
  ensureInitializedFromDom();
  const exclusiveOpen = getOpenOverlays()
    .filter((key) => overlayUsesExclusiveStack(key, layoutState));

  if (exclusiveOpen.length > 1) {
    const keyToKeep = exclusiveOpen.includes(lastActivatedOverlay)
      ? lastActivatedOverlay
      : exclusiveOpen[exclusiveOpen.length - 1];

    exclusiveOpen.forEach((key) => {
      if (key !== keyToKeep) {
        setOverlayOpen(key, false, {
          closeCompeting: false,
          dispatch: true
        });
      }
    });
  }

  Object.keys(OVERLAY_DEFINITIONS).forEach(applyOverlayRender);
  updateOverlayDataset();

  return getOverlayState();
}
