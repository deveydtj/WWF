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
  preferredTileMaximum: 66,
  stableStatusBlockSize: 24,
  verticalGapCount: 4,
  modalBoardInlineRatio: 1.1,
  modalInlineMinimum: 280,
  modalInlineMaximum: 560,
  modalBlockMinimum: 300,
  modalBlockMaximum: 700,
  modalViewportInlineRatio: 0.9,
  modalViewportBlockRatio: 0.85,
  modalPaddingTileRatio: 0.4,
  modalPaddingMinimum: 16,
  modalPaddingMaximum: 28,
  modalCloseControlSize: 44,
  modalCloseControlGap: 12
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

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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

function normalizeLayoutViewport(viewport, visualViewport) {
  if (!viewport) {
    return Object.freeze({
      width: visualViewport.width,
      height: visualViewport.height
    });
  }

  return normalizeSize(viewport, 'measurements.layoutViewport');
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
  readNonNegativeNumber(
    constraints,
    'stableStatusBlockSize',
    'constraints'
  );
  readNonNegativeNumber(
    constraints,
    'verticalGapCount',
    'constraints'
  );

  [
    'modalBoardInlineRatio',
    'modalInlineMinimum',
    'modalInlineMaximum',
    'modalBlockMinimum',
    'modalBlockMaximum',
    'modalViewportInlineRatio',
    'modalViewportBlockRatio',
    'modalPaddingTileRatio',
    'modalPaddingMinimum',
    'modalPaddingMaximum',
    'modalCloseControlSize',
    'modalCloseControlGap'
  ].forEach((field) => readPositiveNumber(constraints, field, 'constraints'));

  if (!Number.isInteger(constraints.verticalGapCount)) {
    throw new TypeError('constraints.verticalGapCount must be a non-negative integer');
  }

  if (constraints.modalInlineMinimum > constraints.modalInlineMaximum) {
    throw new RangeError('constraints modal inline minimum cannot exceed its maximum');
  }
  if (constraints.modalBlockMinimum > constraints.modalBlockMaximum) {
    throw new RangeError('constraints modal block minimum cannot exceed its maximum');
  }
  if (constraints.modalPaddingMinimum > constraints.modalPaddingMaximum) {
    throw new RangeError('constraints modal padding minimum cannot exceed its maximum');
  }
  if (constraints.modalViewportInlineRatio > 1
    || constraints.modalViewportBlockRatio > 1) {
    throw new RangeError('constraints modal viewport ratios cannot exceed 1');
  }

  return Object.freeze(constraints);
}

/**
 * Calculate the board's block-axis budget after every other visible gameplay
 * region has been reserved. The visual viewport only replaces the layout
 * viewport as the outer bound when chat or a native keyboard is constraining
 * it; the measured gameplay container remains the normal layout budget.
 */
export function calculateVerticalBudget(measurements, constraintOverrides = {}) {
  assertObject(measurements, 'measurements');
  const constraints = normalizeConstraints(constraintOverrides);
  const layoutViewportBlockSize = readPositiveNumber(
    measurements,
    'layoutViewportBlockSize',
    'measurements'
  );
  const visualViewportBlockSize = readPositiveNumber(
    measurements,
    'visualViewportBlockSize',
    'measurements'
  );
  const gameplayBlockSize = readPositiveNumber(
    measurements,
    'gameplayBlockSize',
    'measurements'
  );
  const safeAreaTop = readNonNegativeNumber(
    measurements,
    'safeAreaTop',
    'measurements'
  );
  const safeAreaBottom = readNonNegativeNumber(
    measurements,
    'safeAreaBottom',
    'measurements'
  );
  const headerBlockSize = readNonNegativeNumber(
    measurements,
    'headerBlockSize',
    'measurements'
  );
  const statusBlockSize = readNonNegativeNumber(
    measurements,
    'statusBlockSize',
    'measurements'
  );
  const statusMinimumBlockSize = readNonNegativeNumber(
    measurements,
    'statusMinimumBlockSize',
    'measurements',
    constraints.stableStatusBlockSize
  );
  const actionRowBlockSize = readNonNegativeNumber(
    measurements,
    'actionRowBlockSize',
    'measurements'
  );
  const keyboardBlockSize = readNonNegativeNumber(
    measurements,
    'keyboardBlockSize',
    'measurements'
  );
  const verticalGap = readNonNegativeNumber(
    measurements,
    'verticalGap',
    'measurements'
  );
  const additionalReservedBlockSize = readNonNegativeNumber(
    measurements,
    'additionalReservedBlockSize',
    'measurements'
  );
  const isVisuallyConstrained = Boolean(
    measurements.chatOpen || measurements.nativeKeyboardLikelyOpen
  );
  const viewportBlockSize = isVisuallyConstrained
    ? Math.min(layoutViewportBlockSize, visualViewportBlockSize)
    : layoutViewportBlockSize;
  const availableStackBlockSize = Math.min(gameplayBlockSize, viewportBlockSize);
  const reservedStatusBlockSize = Math.max(
    statusBlockSize,
    statusMinimumBlockSize
  );
  const verticalGapsBlockSize = verticalGap * constraints.verticalGapCount;
  const safeAreaBlockSize = safeAreaTop + safeAreaBottom;
  const reservedBlockSize = headerBlockSize
    + reservedStatusBlockSize
    + actionRowBlockSize
    + keyboardBlockSize
    + verticalGapsBlockSize
    + safeAreaBlockSize
    + additionalReservedBlockSize;

  return freezeRecord({
    viewportSource: isVisuallyConstrained ? 'visual-viewport' : 'layout-viewport',
    viewportBlockSize,
    gameplayBlockSize,
    availableStackBlockSize,
    availableBoardBlockSize: Math.max(0, availableStackBlockSize - reservedBlockSize),
    reservedBlockSize,
    reservations: {
      headerBlockSize,
      statusBlockSize: reservedStatusBlockSize,
      actionRowBlockSize,
      keyboardBlockSize,
      verticalGapsBlockSize,
      safeAreaBlockSize,
      additionalReservedBlockSize
    }
  });
}

/**
 * Normalize measurements captured by ViewportService or a test fixture.
 * `boardBudget` is an optional upper bound for the board region; the vertical
 * reservation calculation further reduces its block size below.
 */
export function normalizeLayoutMeasurements(measurements) {
  assertObject(measurements, 'measurements');

  const visualViewport = normalizeVisualViewport(measurements.visualViewport);
  const layoutViewport = normalizeLayoutViewport(
    measurements.layoutViewport,
    visualViewport
  );
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
    layoutViewport,
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
        layoutViewport.height
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
 * Calculate the shared bounds for modal shells from the visual viewport and
 * the rendered board. Minimum preferred sizes are deliberately subordinate to
 * the visual viewport so a short or narrow screen can never push a dialog or
 * its close control outside the visible area.
 */
export function calculateModalMetrics(
  { visualViewport, safeArea = {}, board },
  constraintOverrides = {}
) {
  const viewport = normalizeVisualViewport(visualViewport);
  const normalizedSafeArea = normalizeSafeArea(safeArea);
  assertObject(board, 'modalMeasurements.board');
  const boardInlineSize = readPositiveNumber(
    board,
    'inlineSize',
    'modalMeasurements.board'
  );
  const tileSize = readPositiveNumber(
    board,
    'tileSize',
    'modalMeasurements.board'
  );
  const constraints = normalizeConstraints(constraintOverrides);
  const safeInlineSize = viewport.width
    - normalizedSafeArea.left
    - normalizedSafeArea.right;
  const safeBlockSize = viewport.height
    - normalizedSafeArea.top
    - normalizedSafeArea.bottom;

  if (safeInlineSize <= 0 || safeBlockSize <= 0) {
    throw new RangeError('Safe areas must leave room for modal content');
  }

  const preferredInlineSize = clamp(
    Math.round(boardInlineSize * constraints.modalBoardInlineRatio),
    constraints.modalInlineMinimum,
    constraints.modalInlineMaximum
  );
  const preferredBlockSize = clamp(
    Math.round(safeBlockSize * constraints.modalViewportBlockRatio),
    constraints.modalBlockMinimum,
    constraints.modalBlockMaximum
  );
  const maxInlineSize = Math.max(1, Math.min(
    preferredInlineSize,
    Math.floor(safeInlineSize * constraints.modalViewportInlineRatio)
  ));
  const maxBlockSize = Math.max(1, Math.min(
    preferredBlockSize,
    Math.floor(safeBlockSize * constraints.modalViewportBlockRatio)
  ));
  const padding = Math.min(
    maxInlineSize / 2,
    maxBlockSize / 2,
    clamp(
      Math.round(tileSize * constraints.modalPaddingTileRatio),
      constraints.modalPaddingMinimum,
      constraints.modalPaddingMaximum
    )
  );
  const closeControlReserve = Math.min(
    maxInlineSize,
    constraints.modalCloseControlSize + constraints.modalCloseControlGap
  );

  return freezeRecord({
    maxInlineSize: round(maxInlineSize),
    maxBlockSize: round(maxBlockSize),
    contentMaxBlockSize: round(Math.max(0, maxBlockSize - (padding * 2))),
    padding: round(padding),
    closeControlSize: constraints.modalCloseControlSize,
    closeControlReserve: round(closeControlReserve),
    visualViewportCenter: {
      inline: round(viewport.offsetLeft + (viewport.width / 2)),
      block: round(viewport.offsetTop + (viewport.height / 2))
    },
    safeViewport: {
      inlineSize: round(safeInlineSize),
      blockSize: round(safeBlockSize)
    }
  });
}

/**
 * Turn normalized browser measurements into immutable numeric layout metrics.
 * No CSS strings or DOM state are involved at this stage.
 */
export function calculateLayoutMetrics(measurements, constraintOverrides = {}) {
  const normalized = normalizeLayoutMeasurements(measurements);
  const constraints = normalizeConstraints(constraintOverrides);
  const verticalBudget = calculateVerticalBudget({
    layoutViewportBlockSize: normalized.layoutViewport.height,
    visualViewportBlockSize: normalized.visualViewport.height,
    gameplayBlockSize: normalized.boardBudget.height,
    headerBlockSize: normalized.headerBlockSize,
    statusBlockSize: readNonNegativeNumber(
      measurements,
      'statusBlockSize',
      'measurements'
    ),
    statusMinimumBlockSize: readNonNegativeNumber(
      measurements,
      'statusMinimumBlockSize',
      'measurements',
      constraints.stableStatusBlockSize
    ),
    actionRowBlockSize: readNonNegativeNumber(
      measurements,
      'actionRowBlockSize',
      'measurements'
    ),
    keyboardBlockSize: readNonNegativeNumber(
      measurements,
      'keyboardBlockSize',
      'measurements'
    ),
    verticalGap: readNonNegativeNumber(
      measurements,
      'verticalGap',
      'measurements'
    ),
    additionalReservedBlockSize: readNonNegativeNumber(
      measurements,
      'additionalReservedBlockSize',
      'measurements'
    ),
    safeAreaTop: normalized.safeArea.top,
    safeAreaBottom: normalized.safeArea.bottom,
    chatOpen: measurements.chatOpen,
    nativeKeyboardLikelyOpen: measurements.nativeKeyboardLikelyOpen
  }, constraints);

  if (verticalBudget.availableBoardBlockSize <= 0) {
    throw new RangeError('Vertical reservations leave no room for the board');
  }

  const boardBudget = Object.freeze({
    width: normalized.boardBudget.width,
    height: Math.min(
      normalized.boardBudget.height,
      verticalBudget.availableBoardBlockSize
    )
  });
  const board = calculateBoardMetrics(boardBudget, constraints);
  const modal = calculateModalMetrics({
    visualViewport: normalized.visualViewport,
    safeArea: normalized.safeArea,
    board
  }, constraints);

  return freezeRecord({
    layoutViewport: normalized.layoutViewport,
    visualViewport: normalized.visualViewport,
    appContainer: normalized.appContainer,
    gameplayContainer: normalized.gameplayContainer,
    boardBudget,
    headerBlockSize: normalized.headerBlockSize,
    safeArea: normalized.safeArea,
    verticalBudget,
    board,
    modal
  });
}

function pixels(value) {
  return `${round(value)}px`;
}

/** Serialize modal metrics into the one shared set of CSS sizing tokens. */
export function createModalMetricTokens(modalMetrics) {
  assertObject(modalMetrics, 'modalMetrics');
  assertObject(modalMetrics.visualViewportCenter, 'modalMetrics.visualViewportCenter');

  return Object.freeze({
    '--modal-max-inline-size': pixels(modalMetrics.maxInlineSize),
    '--modal-max-block-size': pixels(modalMetrics.maxBlockSize),
    '--modal-content-max-block-size': pixels(modalMetrics.contentMaxBlockSize),
    '--modal-padding': pixels(modalMetrics.padding),
    '--modal-close-control-size': pixels(modalMetrics.closeControlSize),
    '--modal-close-control-reserve': pixels(modalMetrics.closeControlReserve),
    '--modal-viewport-center-inline': pixels(modalMetrics.visualViewportCenter.inline),
    '--modal-viewport-center-block': pixels(modalMetrics.visualViewportCenter.block)
  });
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
  assertObject(metrics.modal, 'metrics.modal');
  assertObject(metrics.safeArea, 'metrics.safeArea');

  return Object.freeze({
    '--layout-viewport-width': pixels(metrics.layoutViewport?.width || metrics.visualViewport.width),
    '--layout-viewport-height': pixels(metrics.layoutViewport?.height || metrics.visualViewport.height),
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
    '--available-board-block-size': pixels(
      metrics.verticalBudget?.availableBoardBlockSize || metrics.board.availableBlockSize
    ),
    '--tile-size': pixels(metrics.board.tileSize),
    '--tile-gap': pixels(metrics.board.tileGap),
    '--safe-bottom-space': pixels(metrics.safeArea.bottom),
    ...createModalMetricTokens(metrics.modal)
  });
}
