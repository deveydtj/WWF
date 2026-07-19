import {
  GAME_FLOWS,
  LAYOUT_DENSITIES,
  LAYOUT_INTERACTIONS,
  PANEL_CAPACITIES,
  PANEL_PRESENTATIONS,
  createLayoutProfile
} from './layoutProfile.js';

const ORIENTATIONS = new Set(['portrait', 'landscape']);
const POINTER_CAPABILITIES = new Set(['coarse', 'fine', 'mixed']);

function assertObject(value, name) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`${name} must be an object`);
  }
}

function readPositiveNumber(source, field, sourceName) {
  const value = source[field];
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${sourceName}.${field} must be a positive number`);
  }
  return value;
}

function readNonNegativeNumber(source, field, sourceName) {
  const value = source[field];
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${sourceName}.${field} must be a non-negative number`);
  }
  return value;
}

function getAvailableSpace(viewportSnapshot) {
  assertObject(viewportSnapshot, 'viewportSnapshot');

  const layoutViewport = viewportSnapshot.layoutViewport;
  const appContainer = viewportSnapshot.appContainer || layoutViewport;
  assertObject(appContainer, 'viewportSnapshot.appContainer');

  const inlineCandidates = [
    readPositiveNumber(appContainer, 'width', 'viewportSnapshot.appContainer')
  ];
  const blockCandidates = [
    readPositiveNumber(appContainer, 'height', 'viewportSnapshot.appContainer')
  ];

  if (viewportSnapshot.visualViewport) {
    inlineCandidates.push(
      readPositiveNumber(
        viewportSnapshot.visualViewport,
        'width',
        'viewportSnapshot.visualViewport'
      )
    );
    blockCandidates.push(
      readPositiveNumber(
        viewportSnapshot.visualViewport,
        'height',
        'viewportSnapshot.visualViewport'
      )
    );
  }

  return Object.freeze({
    inlineSize: Math.min(...inlineCandidates),
    blockSize: Math.min(...blockCandidates)
  });
}

function getPanelMinimums(panelMinimums) {
  assertObject(panelMinimums, 'panelMinimums');
  return {
    inlineSize: readPositiveNumber(panelMinimums, 'inlineSize', 'panelMinimums'),
    gap: readNonNegativeNumber(panelMinimums, 'gap', 'panelMinimums'),
    outerGutters: readNonNegativeNumber(
      panelMinimums,
      'outerGutters',
      'panelMinimums'
    )
  };
}

function getGameplayMinimums(gameplayMinimums) {
  assertObject(gameplayMinimums, 'gameplayMinimums');
  return {
    inlineSize: readPositiveNumber(
      gameplayMinimums,
      'inlineSize',
      'gameplayMinimums'
    ),
    blockSize: readPositiveNumber(
      gameplayMinimums,
      'blockSize',
      'gameplayMinimums'
    ),
    splitLandscapeInlineSize: readPositiveNumber(
      gameplayMinimums,
      'splitLandscapeInlineSize',
      'gameplayMinimums'
    ),
    splitLandscapeBlockSize: readPositiveNumber(
      gameplayMinimums,
      'splitLandscapeBlockSize',
      'gameplayMinimums'
    )
  };
}

function requiredInlineSize(railCount, panelMinimums, gameplayMinimums) {
  return gameplayMinimums.inlineSize
    + (railCount * panelMinimums.inlineSize)
    + (railCount * panelMinimums.gap)
    + panelMinimums.outerGutters;
}

function availableGameplayInlineSize(
  availableInlineSize,
  panelCapacity,
  panelMinimums
) {
  return availableInlineSize
    - (panelCapacity * panelMinimums.inlineSize)
    - (panelCapacity * panelMinimums.gap)
    - panelMinimums.outerGutters;
}

/**
 * Classify interaction from pointer and hover capability, never from viewport
 * size or user-agent identity.
 */
export function decideInteraction(viewportSnapshot) {
  assertObject(viewportSnapshot, 'viewportSnapshot');

  const { pointer, hover } = viewportSnapshot;
  if (!POINTER_CAPABILITIES.has(pointer)) {
    throw new TypeError(`Unknown viewport pointer capability: ${String(pointer)}`);
  }
  if (typeof hover !== 'boolean') {
    throw new TypeError('viewportSnapshot.hover must be a boolean');
  }

  if (pointer === 'coarse' && !hover) {
    return LAYOUT_INTERACTIONS.TOUCH_FIRST;
  }
  if (pointer === 'fine' && hover) {
    return LAYOUT_INTERACTIONS.KEYBOARD_FIRST;
  }
  return LAYOUT_INTERACTIONS.HYBRID;
}

/**
 * Calculate how many rail columns physically fit while preserving the minimum
 * playable center and block size. Boundary equality counts as a fit.
 */
export function calculatePanelCapacity(
  viewportSnapshot,
  panelMinimums,
  gameplayMinimums
) {
  const available = getAvailableSpace(viewportSnapshot);
  const panel = getPanelMinimums(panelMinimums);
  const gameplay = getGameplayMinimums(gameplayMinimums);

  if (available.blockSize < gameplay.blockSize) {
    return PANEL_CAPACITIES.NONE;
  }
  if (available.inlineSize >= requiredInlineSize(2, panel, gameplay)) {
    return PANEL_CAPACITIES.TWO;
  }
  if (available.inlineSize >= requiredInlineSize(1, panel, gameplay)) {
    return PANEL_CAPACITIES.ONE;
  }
  return PANEL_CAPACITIES.NONE;
}

export function decideGameFlow(
  viewportSnapshot,
  panelCapacity,
  panelMinimums,
  gameplayMinimums
) {
  const available = getAvailableSpace(viewportSnapshot);
  const panel = getPanelMinimums(panelMinimums);
  const gameplay = getGameplayMinimums(gameplayMinimums);
  const orientation = viewportSnapshot.orientation
    || (available.inlineSize > available.blockSize ? 'landscape' : 'portrait');

  if (!ORIENTATIONS.has(orientation)) {
    throw new TypeError(`Unknown viewport orientation: ${String(orientation)}`);
  }
  if (!Object.values(PANEL_CAPACITIES).includes(panelCapacity)) {
    throw new TypeError(`Unknown panel capacity: ${String(panelCapacity)}`);
  }

  const gameplayInlineSize = availableGameplayInlineSize(
    available.inlineSize,
    panelCapacity,
    panel
  );
  const splitFits = orientation === 'landscape'
    && gameplayInlineSize >= gameplay.splitLandscapeInlineSize
    && available.blockSize >= gameplay.splitLandscapeBlockSize;

  return splitFits ? GAME_FLOWS.SPLIT_LANDSCAPE : GAME_FLOWS.VERTICAL;
}

export function decidePanelPresentation(panelCapacity) {
  if (!Object.values(PANEL_CAPACITIES).includes(panelCapacity)) {
    throw new TypeError(`Unknown panel capacity: ${String(panelCapacity)}`);
  }

  const hasLeftRail = panelCapacity >= PANEL_CAPACITIES.ONE;
  const hasRightRail = panelCapacity >= PANEL_CAPACITIES.TWO;
  return Object.freeze({
    history: hasLeftRail
      ? PANEL_PRESENTATIONS.LEFT_RAIL
      : PANEL_PRESENTATIONS.MODAL,
    definition: hasRightRail
      ? PANEL_PRESENTATIONS.RIGHT_RAIL
      : PANEL_PRESENTATIONS.MODAL,
    chat: hasRightRail
      ? PANEL_PRESENTATIONS.RIGHT_RAIL
      : PANEL_PRESENTATIONS.MODAL,
    players: hasRightRail
      ? PANEL_PRESENTATIONS.RIGHT_RAIL
      : PANEL_PRESENTATIONS.MODAL
  });
}

function decideDensity(spatialPanelCapacity) {
  if (spatialPanelCapacity === PANEL_CAPACITIES.TWO) {
    return LAYOUT_DENSITIES.SPACIOUS;
  }
  if (spatialPanelCapacity === PANEL_CAPACITIES.ONE) {
    return LAYOUT_DENSITIES.COMFORTABLE;
  }
  return LAYOUT_DENSITIES.COMPACT;
}

function getPreference(preferenceState, field, fallback) {
  if (!Object.hasOwn(preferenceState, field)) return fallback;
  if (typeof preferenceState[field] !== 'boolean') {
    throw new TypeError(`preferenceState.${field} must be a boolean`);
  }
  return preferenceState[field];
}

/**
 * Return the complete immutable layout state for a normalized viewport
 * snapshot. This function has no DOM reads or writes and does not mutate any
 * of its inputs.
 */
export function decideLayoutProfile(
  viewportSnapshot,
  panelMinimums,
  gameplayMinimums,
  preferenceState = {}
) {
  assertObject(preferenceState, 'preferenceState');

  const interaction = decideInteraction(viewportSnapshot);
  const spatialPanelCapacity = calculatePanelCapacity(
    viewportSnapshot,
    panelMinimums,
    gameplayMinimums
  );
  const panelCapacity = interaction === LAYOUT_INTERACTIONS.KEYBOARD_FIRST
    ? spatialPanelCapacity
    : Math.min(spatialPanelCapacity, PANEL_CAPACITIES.ONE);
  const density = decideDensity(spatialPanelCapacity);
  const showDesktopKeyboard = getPreference(
    preferenceState,
    'showOnscreenKeyboardOnDesktop',
    true
  );

  return createLayoutProfile({
    density,
    interaction,
    gameFlow: decideGameFlow(
      viewportSnapshot,
      panelCapacity,
      panelMinimums,
      gameplayMinimums
    ),
    panelCapacity,
    panelPresentation: decidePanelPresentation(panelCapacity),
    showGuessField: interaction === LAYOUT_INTERACTIONS.KEYBOARD_FIRST,
    showOnscreenKeyboard: interaction !== LAYOUT_INTERACTIONS.KEYBOARD_FIRST
      || showDesktopKeyboard,
    compactHeader: density === LAYOUT_DENSITIES.COMPACT
  });
}
