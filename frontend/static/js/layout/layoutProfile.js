/**
 * Authoritative vocabulary for responsive layout profiles.
 *
 * This module deliberately contains no viewport or capability decisions. It
 * defines the state shape consumed by those decisions so layout code can share
 * one set of names and reject incomplete or misspelled profiles.
 */

export const LAYOUT_DENSITIES = Object.freeze({
  COMPACT: 'compact',
  COMFORTABLE: 'comfortable',
  SPACIOUS: 'spacious'
});

export const LAYOUT_INTERACTIONS = Object.freeze({
  TOUCH_FIRST: 'touch-first',
  HYBRID: 'hybrid',
  KEYBOARD_FIRST: 'keyboard-first'
});

export const GAME_FLOWS = Object.freeze({
  VERTICAL: 'vertical',
  SPLIT_LANDSCAPE: 'split-landscape'
});

export const PANEL_CAPACITIES = Object.freeze({
  NONE: 0,
  ONE: 1,
  TWO: 2
});

export const PANEL_PRESENTATIONS = Object.freeze({
  MODAL: 'modal',
  LEFT_RAIL: 'left-rail',
  RIGHT_RAIL: 'right-rail',
  STACKED_RIGHT_RAIL: 'stacked-right-rail',
  HIDDEN: 'hidden'
});

export const LAYOUT_PANELS = Object.freeze({
  HISTORY: 'history',
  DEFINITION: 'definition',
  CHAT: 'chat',
  PLAYERS: 'players'
});

const REQUIRED_PROFILE_FIELDS = Object.freeze([
  'density',
  'interaction',
  'gameFlow',
  'panelCapacity',
  'panelPresentation',
  'showGuessField',
  'showOnscreenKeyboard',
  'compactHeader'
]);

const PROFILE_VALUE_SETS = Object.freeze({
  density: new Set(Object.values(LAYOUT_DENSITIES)),
  interaction: new Set(Object.values(LAYOUT_INTERACTIONS)),
  gameFlow: new Set(Object.values(GAME_FLOWS)),
  panelCapacity: new Set(Object.values(PANEL_CAPACITIES))
});

const PANEL_NAMES = Object.freeze(Object.values(LAYOUT_PANELS));
const PANEL_PRESENTATION_VALUES = new Set(Object.values(PANEL_PRESENTATIONS));

function assertKnownValue(field, value) {
  if (!PROFILE_VALUE_SETS[field].has(value)) {
    throw new TypeError(`Unknown layout profile ${field}: ${String(value)}`);
  }
}

function assertBoolean(profile, field) {
  if (typeof profile[field] !== 'boolean') {
    throw new TypeError(`Layout profile ${field} must be a boolean`);
  }
}

function createPanelPresentation(panelPresentation) {
  if (!panelPresentation || typeof panelPresentation !== 'object') {
    throw new TypeError('Layout profile panelPresentation must be an object');
  }

  const normalized = {};
  PANEL_NAMES.forEach((panel) => {
    const presentation = panelPresentation[panel];
    if (!PANEL_PRESENTATION_VALUES.has(presentation)) {
      throw new TypeError(
        `Unknown presentation for layout panel ${panel}: ${String(presentation)}`
      );
    }
    normalized[panel] = presentation;
  });

  return Object.freeze(normalized);
}

/**
 * Create a complete, immutable layout profile from an already-decided state.
 * Decision functions should call this at their output boundary.
 *
 * @param {object} profile
 * @returns {Readonly<{
 *   density: string,
 *   interaction: string,
 *   gameFlow: string,
 *   panelCapacity: number,
 *   panelPresentation: Readonly<Record<string, string>>,
 *   showGuessField: boolean,
 *   showOnscreenKeyboard: boolean,
 *   compactHeader: boolean
 * }>}
 */
export function createLayoutProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new TypeError('Layout profile must be an object');
  }

  REQUIRED_PROFILE_FIELDS.forEach((field) => {
    if (!Object.hasOwn(profile, field)) {
      throw new TypeError(`Layout profile is missing ${field}`);
    }
  });

  assertKnownValue('density', profile.density);
  assertKnownValue('interaction', profile.interaction);
  assertKnownValue('gameFlow', profile.gameFlow);
  assertKnownValue('panelCapacity', profile.panelCapacity);
  assertBoolean(profile, 'showGuessField');
  assertBoolean(profile, 'showOnscreenKeyboard');
  assertBoolean(profile, 'compactHeader');

  return Object.freeze({
    density: profile.density,
    interaction: profile.interaction,
    gameFlow: profile.gameFlow,
    panelCapacity: profile.panelCapacity,
    panelPresentation: createPanelPresentation(profile.panelPresentation),
    showGuessField: profile.showGuessField,
    showOnscreenKeyboard: profile.showOnscreenKeyboard,
    compactHeader: profile.compactHeader
  });
}
