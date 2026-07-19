/**
 * Normalized viewport and container measurements for responsive layout code.
 *
 * Consumers subscribe to this service instead of attaching their own viewport,
 * capability, or ResizeObserver listeners. Measurements are rounded before
 * comparison so sub-pixel noise does not publish redundant snapshots.
 */

const MEDIA_QUERIES = Object.freeze({
  pointerCoarse: '(pointer: coarse)',
  pointerFine: '(pointer: fine)',
  anyPointerCoarse: '(any-pointer: coarse)',
  anyPointerFine: '(any-pointer: fine)',
  hover: '(hover: hover)',
  anyHover: '(any-hover: hover)'
});

const SAFE_AREA_PROPERTIES = Object.freeze({
  top: '--safe-area-inset-top',
  right: '--safe-area-inset-right',
  bottom: '--safe-area-inset-bottom',
  left: '--safe-area-inset-left'
});

const FORCED_UPDATE_REASONS = new Set(['panel']);

function round(value, precision = 2) {
  const number = Number.isFinite(value) ? value : 0;
  const factor = 10 ** precision;
  return Math.round(number * factor) / factor;
}

function positiveDimension(...values) {
  return round(values.find((value) => Number.isFinite(value) && value > 0) || 1);
}

function freezeSnapshot(snapshot) {
  Object.values(snapshot).forEach((value) => {
    if (value && typeof value === 'object') Object.freeze(value);
  });
  return Object.freeze(snapshot);
}

function snapshotsEqual(left, right) {
  return Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));
}

function resolveElement(documentObject, reference, fallbackSelector) {
  if (reference && typeof reference.getBoundingClientRect === 'function') return reference;
  if (!documentObject || typeof documentObject.querySelector !== 'function') return null;
  return documentObject.querySelector(reference || fallbackSelector);
}

function elementSize(element, fallback) {
  const rect = element?.getBoundingClientRect?.();
  return Object.freeze({
    width: positiveDimension(rect?.width, fallback.width),
    height: positiveDimension(rect?.height, fallback.height)
  });
}

function pointerCapability(matches) {
  const coarse = matches.pointerCoarse || matches.anyPointerCoarse;
  const fine = matches.pointerFine || matches.anyPointerFine;

  if (coarse && fine) return 'mixed';
  if (coarse) return 'coarse';
  return 'fine';
}

/**
 * Observe browser viewport state and publish normalized snapshots.
 */
export class ViewportService {
  constructor(options = {}) {
    this.window = options.windowObject || (typeof window !== 'undefined' ? window : null);
    this.document = options.documentObject || (typeof document !== 'undefined' ? document : null);
    this.appReference = options.appContainer || '#appContainer';
    this.gameplayReference = options.gameplayContainer || '#centerPanel';
    this.subscribers = new Set();
    this.mediaQueries = new Map();
    this.snapshot = null;
    this.resizeObserver = null;
    this.safeAreaProbe = null;
    this.animationFrame = null;
    this.pendingReasons = new Set();
    this.started = false;

    this.sourceHandlers = Object.freeze({
      resize: () => this.scheduleUpdate('resize'),
      orientation: () => this.scheduleUpdate('orientation'),
      visualViewport: () => this.scheduleUpdate('visual-viewport'),
      container: () => this.scheduleUpdate('container'),
      capability: () => this.scheduleUpdate('capability'),
      panel: () => this.scheduleUpdate('panel')
    });
  }

  /** Start observing and synchronously capture the initial snapshot. */
  start() {
    if (this.started) return this.snapshot;
    if (!this.window || !this.document) return null;

    this.started = true;
    this.appContainer = resolveElement(this.document, this.appReference, '#appContainer');
    this.gameplayContainer = resolveElement(
      this.document,
      this.gameplayReference,
      '#centerPanel'
    );
    this.installSafeAreaProbe();
    this.setupMediaQueries();
    this.setupObservers();
    this.snapshot = this.measure();
    return this.snapshot;
  }

  /**
   * Subscribe to meaningful snapshot changes.
   *
   * @param {(snapshot: object, previousSnapshot: object|null, update: object) => void} callback
   * @param {{emitCurrent?: boolean}} options
   * @returns {() => void} unsubscribe callback
   */
  subscribe(callback, options = {}) {
    if (typeof callback !== 'function') {
      throw new TypeError('ViewportService subscriber must be a function');
    }

    if (!this.started) this.start();
    this.subscribers.add(callback);

    if (options.emitCurrent !== false && this.snapshot) {
      callback(this.snapshot, null, Object.freeze({
        reasons: Object.freeze(['initial']),
        snapshotChanged: true
      }));
    }

    return () => this.subscribers.delete(callback);
  }

  /** Return the latest immutable snapshot. */
  getSnapshot() {
    if (!this.started) this.start();
    return this.snapshot;
  }

  /**
   * Queue one layout update for the next animation frame.
   *
   * All invalidation sources share this queue. Reasons are retained for
   * diagnostics and allow panel changes to run the layout decision pipeline
   * even when their first render does not change a measured container size.
   */
  scheduleUpdate(reason = 'manual') {
    if (!this.started) return;

    this.pendingReasons.add(reason);
    if (this.animationFrame !== null) return;

    const requestFrame = this.window.requestAnimationFrame
      || ((callback) => this.window.setTimeout(callback, 16));
    this.animationFrame = requestFrame.call(this.window, () => {
      this.animationFrame = null;
      const reasons = Object.freeze([...this.pendingReasons]);
      this.pendingReasons.clear();
      this.publishIfChanged(reasons);
    });
  }

  /** Remove all browser observers and listeners owned by the service. */
  destroy() {
    if (!this.started) return;

    this.window.removeEventListener('resize', this.sourceHandlers.resize);
    this.window.removeEventListener('orientationchange', this.sourceHandlers.orientation);
    this.window.visualViewport?.removeEventListener('resize', this.sourceHandlers.visualViewport);
    this.window.visualViewport?.removeEventListener('scroll', this.sourceHandlers.visualViewport);
    this.document.removeEventListener('overlaychange', this.sourceHandlers.panel);

    this.mediaQueries.forEach((mediaQuery) => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', this.sourceHandlers.capability);
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(this.sourceHandlers.capability);
      }
    });
    this.mediaQueries.clear();

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.animationFrame !== null) {
      const cancelFrame = this.window.cancelAnimationFrame || this.window.clearTimeout;
      cancelFrame.call(this.window, this.animationFrame);
      this.animationFrame = null;
    }
    this.pendingReasons.clear();

    this.safeAreaProbe?.remove();
    this.safeAreaProbe = null;
    this.subscribers.clear();
    this.started = false;
  }

  setupMediaQueries() {
    if (typeof this.window.matchMedia !== 'function') return;

    Object.entries(MEDIA_QUERIES).forEach(([name, query]) => {
      const mediaQuery = this.window.matchMedia(query);
      this.mediaQueries.set(name, mediaQuery);
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', this.sourceHandlers.capability);
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(this.sourceHandlers.capability);
      }
    });
  }

  setupObservers() {
    this.window.addEventListener('resize', this.sourceHandlers.resize, { passive: true });
    this.window.addEventListener('orientationchange', this.sourceHandlers.orientation, { passive: true });
    this.window.visualViewport?.addEventListener('resize', this.sourceHandlers.visualViewport, { passive: true });
    this.window.visualViewport?.addEventListener('scroll', this.sourceHandlers.visualViewport, { passive: true });
    this.document.addEventListener('overlaychange', this.sourceHandlers.panel);

    if (typeof this.window.ResizeObserver !== 'function') return;

    this.resizeObserver = new this.window.ResizeObserver(this.sourceHandlers.container);
    if (this.appContainer) this.resizeObserver.observe(this.appContainer);
    if (this.gameplayContainer && this.gameplayContainer !== this.appContainer) {
      this.resizeObserver.observe(this.gameplayContainer);
    }
  }

  installSafeAreaProbe() {
    if (!this.document.documentElement || typeof this.document.createElement !== 'function') return;

    const probe = this.document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = [
      'position:fixed',
      'visibility:hidden',
      'pointer-events:none',
      'inset:auto',
      'width:0',
      'height:0',
      'top:var(--safe-area-inset-top, 0px)',
      'right:var(--safe-area-inset-right, 0px)',
      'bottom:var(--safe-area-inset-bottom, 0px)',
      'left:var(--safe-area-inset-left, 0px)'
    ].join(';');
    this.document.documentElement.appendChild(probe);
    this.safeAreaProbe = probe;
  }

  getMediaMatches() {
    return Object.fromEntries(
      Object.keys(MEDIA_QUERIES).map((name) => [name, Boolean(this.mediaQueries.get(name)?.matches)])
    );
  }

  getSafeArea() {
    const root = this.document.documentElement;
    const rootStyles = root && typeof this.window.getComputedStyle === 'function'
      ? this.window.getComputedStyle(root)
      : null;
    const probeStyles = this.safeAreaProbe && typeof this.window.getComputedStyle === 'function'
      ? this.window.getComputedStyle(this.safeAreaProbe)
      : null;

    return Object.freeze(Object.fromEntries(
      Object.entries(SAFE_AREA_PROPERTIES).map(([side, property]) => {
        const directValue = rootStyles?.getPropertyValue(property)?.trim() || '';
        const resolvedValue = probeStyles?.getPropertyValue(side) || directValue;
        return [side, round(parseFloat(resolvedValue) || 0)];
      })
    ));
  }

  measure() {
    const layoutViewport = Object.freeze({
      width: positiveDimension(this.window.innerWidth, this.document.documentElement?.clientWidth),
      height: positiveDimension(this.window.innerHeight, this.document.documentElement?.clientHeight)
    });
    const visual = this.window.visualViewport;
    const visualViewport = Object.freeze({
      width: positiveDimension(visual?.width, layoutViewport.width),
      height: positiveDimension(visual?.height, layoutViewport.height),
      offsetTop: round(visual?.offsetTop),
      offsetLeft: round(visual?.offsetLeft)
    });
    const matches = this.getMediaMatches();
    const ratio = layoutViewport.width / layoutViewport.height;

    return freezeSnapshot({
      layoutViewport,
      visualViewport,
      appContainer: elementSize(this.appContainer, layoutViewport),
      gameplayContainer: elementSize(this.gameplayContainer, layoutViewport),
      safeArea: this.getSafeArea(),
      orientation: ratio > 1 ? 'landscape' : 'portrait',
      aspectRatio: round(ratio, 4),
      pointer: pointerCapability(matches),
      hover: matches.hover,
      anyHover: matches.anyHover
    });
  }

  publishIfChanged(reasons = Object.freeze(['manual'])) {
    const previousSnapshot = this.snapshot;
    const nextSnapshot = this.measure();
    const snapshotChanged = !snapshotsEqual(previousSnapshot, nextSnapshot);
    const forceUpdate = reasons.some((reason) => FORCED_UPDATE_REASONS.has(reason));
    if (!snapshotChanged && !forceUpdate) return;

    if (snapshotChanged) this.snapshot = nextSnapshot;

    const update = Object.freeze({ reasons, snapshotChanged });
    this.subscribers.forEach((callback) => callback(this.snapshot, previousSnapshot, update));
  }
}

export default ViewportService;
