/**
 * Pure responsive layout metric calculations.
 *
 * This module deliberately does not read from or write to the DOM. Browser
 * measurements are supplied by the caller and CSS-ready tokens are produced
 * separately so later integration can keep measurement, calculation, and
 * rendering as distinct stages.
 */

export const DEFAULT_LAYOUT_METRIC_CONSTRAINTS = Object.freeze({
  boardColumns: 5,
  boardRows: 6,
  tileGap: 8,
  preferredTileMaximum: 66
});

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
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

function readNonNegativeNumber(source, field, sourceName, fallback = 0) {
  const value = Object.hasOwn(source, field) ? source[field] : fallback;
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${sourceName}.${field} must be a non-negative number`);
  }
  return value;
}

function readPositiveInteger(source, field, sourceName) {
  const value = source[field];
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${sourceName}.${field} must be a positive integer`);
  }
  return value;
}

function round(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function freezeRecord(record) {
  Object.values(record).forEach((value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      freezeRecord(value);
    }
  });
  return Object.freeze(record);
}

function normalizeSize(size, name) {
  assertObject(size, name);
  return Object.freeze({
    width: readPositiveNumber(size, 'width', name),
    height: readPositiveNumber(size, 'height', name)
  });
}

function normalizeVisualViewport(viewport) {
  const size = normalizeSize(viewport, 'measurements.visualViewport');
  return Object.freeze({
    ...size,
    offsetTop: readNonNegativeNumber(
      viewport,
      'offsetTop',
      'measurements.visualViewport'
    ),
    offsetLeft: readNonNegativeNumber(
      viewport,
      'offsetLeft',
      'measurements.visualViewport'
    )
  });
}

function normalizeSafeArea(safeArea = {}) {
  assertObject(safeArea, 'measurements.safeArea');
  return Object.freeze({
    top: readNonNegativeNumber(safeArea, 'top', 'measurements.safeArea'),
    right: readNonNegativeNumber(safeArea, 'right', 'measurements.safeArea'),
    bottom: readNonNegativeNumber(safeArea, 'bottom', 'measurements.safeArea'),
    left: readNonNegativeNumber(safeArea, 'left', 'measurements.safeArea')
  });
}

function normalizeConstraints(overrides = {}) {
  assertObject(overrides, 'constraints');
  const constraints = {
    ...DEFAULT_LAYOUT_METRIC_CONSTRAINTS,
    ...overrides
  };

  readPositiveInteger(constraints, 'boardColumns', 'constraints');
  readPositiveInteger(constraints, 'boardRows', 'constraints');
  readNonNegativeNumber(constraints, 'tileGap', 'constraints');
  readPositiveNumber(
    constraints,
    'preferredTileMaximum',
    'constraints'
  );

  return Object.freeze(constraints);
}

/**
 * Normalize measurements captured by ViewportService or a test fixture.
 * `boardBudget` is the already-reserved board region; when omitted, the
 * measured gameplay container is the budget.
 */
export function normalizeLayoutMeasurements(measurements) {
  assertObject(measurements, 'measurements');

  const visualViewport = normalizeVisualViewport(measurements.visualViewport);
  const appContainer = normalizeSize(
    measurements.appContainer,
    'measurements.appContainer'
  );
  const gameplayContainer = normalizeSize(
    measurements.gameplayContainer,
    'measurements.gameplayContainer'
  );
  const requestedBoardBudget = normalizeSize(
    measurements.boardBudget || measurements.gameplayContainer,
    'measurements.boardBudget'
  );
  const safeArea = normalizeSafeArea(measurements.safeArea);
  const safeVisualWidth = visualViewport.width - safeArea.left - safeArea.right;
  const safeVisualHeight = visualViewport.height - safeArea.top - safeArea.bottom;

  if (safeVisualWidth <= 0 || safeVisualHeight <= 0) {
    throw new RangeError('Safe areas must leave a positive visual viewport');
  }

  return freezeRecord({
    visualViewport,
    appContainer,
    gameplayContainer,
    boardBudget: {
      width: Math.min(
        requestedBoardBudget.width,
        gameplayContainer.width,
        safeVisualWidth
      ),
      height: Math.min(
        requestedBoardBudget.height,
        gameplayContainer.height,
        safeVisualHeight
      )
    },
    headerBlockSize: readNonNegativeNumber(
      measurements,
      'headerBlockSize',
      'measurements'
    ),
    safeArea
  });
}

/**
 * Calculate a square-tile board from an explicit inline/block budget.
 * The formula follows the responsive plan exactly: the smaller of the width
 * budget, height budget, and preferred maximum controls tile size.
 */
export function calculateBoardMetrics(boardBudget, constraintOverrides = {}) {
  const budget = normalizeSize(boardBudget, 'boardBudget');
  const constraints = normalizeConstraints(constraintOverrides);
  const {
    boardColumns,
    boardRows,
    tileGap,
    preferredTileMaximum
  } = constraints;
  const inlineGaps = (boardColumns - 1) * tileGap;
  const blockGaps = (boardRows - 1) * tileGap;
  const widthTile = (budget.width - inlineGaps) / boardColumns;
  const heightTile = (budget.height - blockGaps) / boardRows;
  const tileSize = Math.floor(Math.min(
    widthTile,
    heightTile,
    preferredTileMaximum
  ));

  if (tileSize <= 0) {
    throw new RangeError('Board budget is too small for the configured grid and gaps');
  }

  const inlineSize = (boardColumns * tileSize) + inlineGaps;
  const blockSize = (boardRows * tileSize) + blockGaps;
  let limitingAxis = 'maximum';
  if (widthTile <= heightTile && widthTile <= preferredTileMaximum) {
    limitingAxis = 'width';
  } else if (heightTile <= preferredTileMaximum) {
    limitingAxis = 'height';
  }

  return freezeRecord({
    columns: boardColumns,
    rows: boardRows,
    tileSize,
    tileGap,
    inlineSize,
    blockSize,
    limitingAxis,
    availableInlineSize: budget.width,
    availableBlockSize: budget.height,
    widthConstrainedTileSize: round(widthTile),
    heightConstrainedTileSize: round(heightTile),
    unusedInlineSize: round(budget.width - inlineSize),
    unusedBlockSize: round(budget.height - blockSize)
  });
}

/**
 * Turn normalized browser measurements into immutable numeric layout metrics.
 * No CSS strings or DOM state are involved at this stage.
 */
export function calculateLayoutMetrics(measurements, constraintOverrides = {}) {
  const normalized = normalizeLayoutMeasurements(measurements);
  const constraints = normalizeConstraints(constraintOverrides);
  const board = calculateBoardMetrics(normalized.boardBudget, constraints);

  return freezeRecord({
    visualViewport: normalized.visualViewport,
    appContainer: normalized.appContainer,
    gameplayContainer: normalized.gameplayContainer,
    boardBudget: normalized.boardBudget,
    headerBlockSize: normalized.headerBlockSize,
    safeArea: normalized.safeArea,
    board
  });
}

function pixels(value) {
  return `${round(value)}px`;
}

/**
 * Serialize calculated numbers into CSS tokens without applying them. The
 * eventual DOM integration can diff and write this record once per frame.
 */
export function createLayoutMetricTokens(metrics) {
  assertObject(metrics, 'metrics');
  assertObject(metrics.visualViewport, 'metrics.visualViewport');
  assertObject(metrics.appContainer, 'metrics.appContainer');
  assertObject(metrics.gameplayContainer, 'metrics.gameplayContainer');
  assertObject(metrics.board, 'metrics.board');
  assertObject(metrics.safeArea, 'metrics.safeArea');

  return Object.freeze({
    '--visual-viewport-width': pixels(metrics.visualViewport.width),
    '--visual-viewport-height': pixels(metrics.visualViewport.height),
    '--visual-viewport-offset-top': pixels(metrics.visualViewport.offsetTop),
    '--visual-viewport-offset-left': pixels(metrics.visualViewport.offsetLeft),
    '--app-inline-size': pixels(metrics.appContainer.width),
    '--app-block-size': pixels(metrics.appContainer.height),
    '--game-inline-size': pixels(metrics.gameplayContainer.width),
    '--game-block-size': pixels(metrics.gameplayContainer.height),
    '--header-block-size': pixels(metrics.headerBlockSize),
    '--board-inline-size': pixels(metrics.board.inlineSize),
    '--board-block-size': pixels(metrics.board.blockSize),
    '--tile-size': pixels(metrics.board.tileSize),
    '--tile-gap': pixels(metrics.board.tileGap),
    '--safe-bottom-space': pixels(metrics.safeArea.bottom)
  });
}
