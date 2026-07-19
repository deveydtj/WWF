/**
 * Current-state responsive audit capture for Phase 0.1.
 *
 * This is intentionally an observation harness, not a regression suite. It
 * uses the current uninitialized game page because the deterministic lobby
 * fixture belongs to Phase 0.2. Run it only when refreshing the checked-in
 * audit artifacts:
 *
 *   python3 -m http.server 4173 --directory frontend
 *   GENERATE_RESPONSIVE_AUDIT=1 AUDIT_BASE_URL=http://127.0.0.1:4173 \
 *     npx playwright test tests/playwright/responsive-current-state-audit.spec.js \
 *     --project=chromium --workers=1
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const GENERATE_AUDIT = process.env.GENERATE_RESPONSIVE_AUDIT === '1';
const BASE_URL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = path.resolve(__dirname, '../../docs/responsive/audit-artifacts');

const SCENARIOS = [
  { slug: 'minimum-phone-320x568', label: 'Minimum supported phone', width: 320, height: 568, capability: 'coarse / no hover', hasTouch: true, isMobile: true },
  { slug: 'small-android-360x640', label: 'Small Android phone', width: 360, height: 640, capability: 'coarse / no hover', hasTouch: true, isMobile: true },
  { slug: 'modern-iphone-390x844', label: 'Modern iPhone', width: 390, height: 844, capability: 'coarse / no hover', hasTouch: true, isMobile: true },
  { slug: 'large-phone-430x932', label: 'Large phone', width: 430, height: 932, capability: 'coarse / no hover', hasTouch: true, isMobile: true },
  { slug: 'phone-landscape-short-667x375', label: 'Phone landscape short', width: 667, height: 375, capability: 'coarse / no hover', hasTouch: true, isMobile: true },
  { slug: 'phone-landscape-wide-844x390', label: 'Phone landscape wide', width: 844, height: 390, capability: 'coarse / no hover', hasTouch: true, isMobile: true },
  { slug: 'small-tablet-portrait-744x1133', label: 'Small tablet portrait', width: 744, height: 1133, capability: 'coarse / no hover', hasTouch: true, isMobile: true },
  { slug: 'tablet-portrait-768x1024', label: 'Tablet portrait', width: 768, height: 1024, capability: 'coarse / no hover', hasTouch: true, isMobile: true },
  { slug: 'large-tablet-portrait-820x1180', label: 'Large tablet portrait', width: 820, height: 1180, capability: 'coarse / no hover', hasTouch: true, isMobile: true },
  { slug: 'tablet-landscape-1024x768', label: 'Tablet landscape', width: 1024, height: 768, capability: 'coarse / no hover', hasTouch: true, isMobile: true },
  { slug: 'small-laptop-1024x768', label: 'Small laptop', width: 1024, height: 768, capability: 'fine / hover', hasTouch: false, isMobile: false },
  { slug: 'common-laptop-1366x768', label: 'Common laptop', width: 1366, height: 768, capability: 'fine / hover', hasTouch: false, isMobile: false },
  { slug: 'short-wide-desktop-1600x650', label: 'Short wide desktop', width: 1600, height: 650, capability: 'fine / hover', hasTouch: false, isMobile: false },
  { slug: 'full-hd-desktop-1920x1080', label: 'Full HD desktop', width: 1920, height: 1080, capability: 'fine / hover', hasTouch: false, isMobile: false },
  { slug: 'ultra-wide-2560x1440', label: 'Ultra-wide', width: 2560, height: 1440, capability: 'fine / hover', hasTouch: false, isMobile: false },
  { slug: 'touch-windows-laptop-1366x768', label: 'Touch Windows laptop', width: 1366, height: 768, capability: 'mixed / hover', hasTouch: true, isMobile: false, requestedMixed: true },
  { slug: 'zoomed-desktop-960x540', label: 'Zoomed desktop (effective 200%)', width: 960, height: 540, capability: 'fine / hover', hasTouch: false, isMobile: false },
];

const ELEMENTS = {
  appContainer: '#appContainer',
  lobbyHeader: '#lobbyHeader',
  titleBar: '#titleBar',
  board: '#board',
  inputArea: '#inputArea',
  guessInput: '#guessInput',
  keyboard: '#keyboard',
  landscapeOverlay: '#landscapeOverlay',
};

const PANELS = {
  history: { selector: '#historyBox', bodyClass: 'history-open', elementClasses: ['active', 'visible'] },
  definition: { selector: '#definitionBox', bodyClass: 'definition-open', elementClasses: ['active', 'visible'] },
  chat: { selector: '#chatBox', bodyClass: 'chat-open', elementClasses: ['active', 'visible'] },
  players: { selector: '#playerSidebar', bodyClass: 'players-open', elementClasses: ['visible'] },
};

function ensureArtifactDirectory() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function prepareAuditSurface(page) {
  await page.locator('#board .tile').first().waitFor({ state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    // These surfaces are side effects of loading without a lobby. The landscape
    // overlay is deliberately not suppressed because it is responsive behavior.
    const incidentalOverlays = [
      '#waitingOverlay', '#shareModal', '#emojiModal', '#closeCallPopup',
      '#infoPopup', '#optionsMenu', '#mobileMenuPopup', '#panelBackdrop',
      '#messagePopup',
    ];
    incidentalOverlays.forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.style.display = 'none';
    });

    const historyList = document.querySelector('#historyList');
    if (historyList) {
      historyList.innerHTML = Array.from({ length: 12 }, (_, index) =>
        `<li>Audit guess ${index + 1}: CRANE — synthetic long-content measurement</li>`
      ).join('');
    }

    const definition = document.querySelector('#definitionText');
    if (definition) {
      definition.textContent = 'Synthetic audit definition. '.repeat(80);
    }

    const chatMessages = document.querySelector('#chatMessages');
    if (chatMessages) {
      chatMessages.innerHTML = Array.from({ length: 20 }, (_, index) =>
        `<p>Player ${index + 1}: synthetic audit message with long content.</p>`
      ).join('');
    }

    const playerList = document.querySelector('#playerList');
    if (playerList) {
      playerList.innerHTML = Array.from({ length: 12 }, (_, index) =>
        `<li>Player ${index + 1} 🧪</li>`
      ).join('');
    }

    // The static page has no lobby route, so initialization hides the header.
    // Reveal it with audit-only content to measure the production header CSS.
    const lobbyHeader = document.querySelector('#lobbyHeader');
    const lobbyCode = document.querySelector('#lobbyCode');
    const leaderboard = document.querySelector('#leaderboard');
    lobbyHeader?.style.removeProperty('display');
    if (lobbyCode) lobbyCode.textContent = 'AUDIT1';
    if (leaderboard) leaderboard.innerHTML = '<span>🧪 12</span><span>🦊 8</span><span>🐼 5</span>';

    document.body.classList.remove('history-open', 'definition-open', 'chat-open', 'players-open');
    ['#historyBox', '#definitionBox', '#chatBox', '#playerSidebar'].forEach((selector) => {
      const element = document.querySelector(selector);
      element?.classList.remove('active', 'visible');
    });
  });

  await settle(page);
}

async function activateVirtualKeyAndRecordFocus(page) {
  return page.evaluate(() => {
    const guessInput = document.querySelector('#guessInput');
    const key = document.querySelector('.key[data-key="q"]');
    if (!guessInput || !key) {
      return { activated: false, activeElementAfter: document.activeElement?.id || null };
    }

    guessInput.blur();
    key.click();
    const result = {
      activated: true,
      activeElementAfter: document.activeElement?.id || null,
      guessInputFocused: document.activeElement === guessInput,
    };

    document.querySelector('.key[data-key="Backspace"]')?.click();
    guessInput.blur();
    return result;
  });
}

async function captureMetrics(page, scenario, virtualKeyResult) {
  return page.evaluate(({ scenario: requested, elementSelectors, panelDefinitions, virtualKeyResult: keyResult }) => {
    const round = (value) => Math.round(value * 100) / 100;
    const visualWidth = window.visualViewport?.width || window.innerWidth;
    const visualHeight = window.visualViewport?.height || window.innerHeight;

    const rectFor = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: round(rect.x),
        y: round(rect.y),
        left: round(rect.left),
        top: round(rect.top),
        width: round(rect.width),
        height: round(rect.height),
        right: round(rect.right),
        bottom: round(rect.bottom),
      };
    };

    const elementData = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return { exists: false };
      const style = getComputedStyle(element);
      const rect = rectFor(element);
      const visible = style.display !== 'none' && style.visibility !== 'hidden' &&
        parseFloat(style.opacity || '1') > 0 && rect.width > 0 && rect.height > 0;
      return {
        exists: true,
        visible,
        rect,
        display: style.display,
        position: style.position,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        fitsVisualViewport: visible
          ? rect.left >= -1 && rect.top >= -1 && rect.right <= visualWidth + 1 && rect.bottom <= visualHeight + 1
          : null,
      };
    };

    const elements = Object.fromEntries(
      Object.entries(elementSelectors).map(([name, selector]) => [name, elementData(selector)])
    );

    const firstTile = document.querySelector('#board .tile');
    const tileRect = rectFor(firstTile);
    const boardRect = elements.board.rect;
    const keyboardRect = elements.keyboard.rect;
    const boardKeyboardOverlap = Boolean(
      elements.board.visible && elements.keyboard.visible &&
      boardRect.left < keyboardRect.right && boardRect.right > keyboardRect.left &&
      boardRect.top < keyboardRect.bottom && boardRect.bottom > keyboardRect.top
    );

    const panels = {};
    for (const [name, definition] of Object.entries(panelDefinitions)) {
      document.body.classList.remove('history-open', 'definition-open', 'chat-open', 'players-open');
      document.querySelectorAll('#historyBox, #definitionBox, #chatBox, #playerSidebar').forEach((element) => {
        element.classList.remove('active', 'visible');
      });

      const element = document.querySelector(definition.selector);
      document.body.classList.add(definition.bodyClass);
      definition.elementClasses.forEach((className) => element?.classList.add(className));
      if (element) element.style.transition = 'none';

      const data = elementData(definition.selector);
      panels[name] = {
        ...data,
        inferredPresentation: data.position === 'fixed' ? 'modal-like' : 'rail-like',
        role: element?.getAttribute('role') || null,
        ariaModal: element?.getAttribute('aria-modal') || null,
      };
    }

    document.body.classList.remove('history-open', 'definition-open', 'chat-open', 'players-open');
    document.querySelectorAll('#historyBox, #definitionBox, #chatBox, #playerSidebar').forEach((element) => {
      element.classList.remove('active', 'visible');
    });

    return {
      scenario: requested,
      observed: {
        layoutMode: document.body.dataset.mode || null,
        historyPopup: document.body.dataset.historyPopup === 'true',
        bodyClasses: Array.from(document.body.classList),
        pointerCoarse: matchMedia('(pointer: coarse)').matches,
        anyPointerCoarse: matchMedia('(any-pointer: coarse)').matches,
        hover: matchMedia('(hover: hover)').matches,
        anyHover: matchMedia('(any-hover: hover)').matches,
        orientation: window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait',
        layoutViewport: { width: window.innerWidth, height: window.innerHeight },
        visualViewport: {
          width: round(visualWidth),
          height: round(visualHeight),
          offsetLeft: round(window.visualViewport?.offsetLeft || 0),
          offsetTop: round(window.visualViewport?.offsetTop || 0),
        },
      },
      page: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      },
      elements,
      tile: tileRect,
      fit: {
        boardFits: elements.board.fitsVisualViewport,
        keyboardFits: elements.keyboard.fitsVisualViewport,
        headerFits: elements.lobbyHeader.fitsVisualViewport,
        inputAreaFits: elements.inputArea.fitsVisualViewport,
        boardKeyboardOverlap,
        rotatePromptVisible: elements.landscapeOverlay.visible,
        rotatePromptCoversViewport: Boolean(
          elements.landscapeOverlay.visible && elements.landscapeOverlay.position === 'fixed' &&
          elements.landscapeOverlay.rect.width >= visualWidth * 0.9 &&
          elements.landscapeOverlay.rect.height >= visualHeight * 0.9
        ),
      },
      panels,
      virtualKey: {
        ...keyResult,
        nativeKeyboardObservableInHeadlessBrowser: false,
        nativeKeyboardRiskOnTouchDevice: Boolean(requested.hasTouch && keyResult.guessInputFocused),
      },
    };
  }, {
    scenario,
    elementSelectors: ELEMENTS,
    panelDefinitions: PANELS,
    virtualKeyResult,
  });
}

test.describe('Phase 0.1 current-state responsive audit', () => {
  test.skip(!GENERATE_AUDIT, 'Set GENERATE_RESPONSIVE_AUDIT=1 to refresh audit artifacts.');

  test('capture the required responsive matrix', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Audit artifacts use Chromium for deterministic output.');
    ensureArtifactDirectory();

    const summary = [];
    for (const scenario of SCENARIOS) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        screen: { width: scenario.width, height: scenario.height },
        hasTouch: scenario.hasTouch,
        isMobile: scenario.isMobile,
        deviceScaleFactor: 1,
        colorScheme: 'light',
      });
      const page = await context.newPage();

      if (scenario.requestedMixed) {
        await page.addInitScript(() => {
          const nativeMatchMedia = window.matchMedia.bind(window);
          const forcedMatches = new Map([
            ['(pointer: coarse)', false],
            ['(pointer: fine)', true],
            ['(any-pointer: coarse)', true],
            ['(any-pointer: fine)', true],
            ['(hover: hover)', true],
            ['(any-hover: hover)', true],
          ]);
          window.matchMedia = (query) => {
            const result = nativeMatchMedia(query);
            const normalized = query.trim().toLowerCase();
            if (!forcedMatches.has(normalized)) return result;
            return new Proxy(result, {
              get(target, property) {
                if (property === 'matches') return forcedMatches.get(normalized);
                const value = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
          };
        });
      }

      await page.goto(`${BASE_URL}/game.html`, { waitUntil: 'networkidle' });
      await prepareAuditSurface(page);

      expect(await page.locator('#board .tile').count()).toBe(30);
      const virtualKeyResult = await activateVirtualKeyAndRecordFocus(page);
      const metrics = await captureMetrics(page, scenario, virtualKeyResult);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${scenario.slug}.png`),
        fullPage: true,
      });
      fs.writeFileSync(
        path.join(ARTIFACT_DIR, `${scenario.slug}.json`),
        `${JSON.stringify(metrics, null, 2)}\n`
      );
      summary.push(metrics);

      await context.close();
    }

    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'summary.json'),
      `${JSON.stringify(summary, null, 2)}\n`
    );
    expect(summary).toHaveLength(SCENARIOS.length);
  });
});
