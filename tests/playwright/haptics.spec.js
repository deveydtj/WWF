const { test, expect, FIXTURE_STATES } = require('./fixtures/deterministic-lobby');

async function recordVibrations(page) {
  await page.addInitScript(() => {
    window.vibrations = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value(pattern) { window.vibrations.push(pattern); return true; },
    });
  });
}

test.describe('touch haptics', () => {
  test.use({ viewport: { width: 390, height: 700 }, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    // Desktop WebKit's touch emulation doesn't report the phone's touch count.
    await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { value: 1 }));
  });

  test('accepted virtual letters and deletion pulse once; ignored and physical keys do not', async ({ page, deterministicLobby }) => {
    await recordVibrations(page);
    await deterministicLobby.openActive();
    await page.locator('.key[data-key="q"]').tap();
    await page.locator('.key[data-key="Backspace"]').tap();
    await page.locator('.key[data-key="Backspace"]').tap();
    await page.keyboard.type('w');
    await expect(page.locator('#guessInput')).toHaveValue('SW');
    expect(await page.evaluate(() => window.vibrations)).toEqual([8, 8]);
  });

  test('navigation pulses and the independent Haptics preference survives reload', async ({ page, deterministicLobby }) => {
    await recordVibrations(page);
    await deterministicLobby.openActive();
    await page.locator('#optionsToggle').tap();
    expect(await page.evaluate(() => window.vibrations)).toEqual([8]);
    await expect(page.locator('#menuHaptics')).toHaveText('📳 Haptics On');
    await page.locator('#menuHaptics').tap();
    await expect(page.locator('#menuHaptics')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.vibrations)).toEqual([8, 0]);
    expect(await page.evaluate(() => localStorage.getItem('soundEnabled'))).toBe('false');
    await page.keyboard.press('Escape');
    await page.locator('.key[data-key="q"]').tap();
    expect(await page.evaluate(() => window.vibrations)).toEqual([8, 0]);
    await page.reload();
    await page.locator('#optionsToggle').tap();
    await expect(page.locator('#menuHaptics')).toHaveText('📳 Haptics Off');
    expect(await page.evaluate(() => window.vibrations)).toEqual([]);
    await page.locator('#menuHaptics').tap();
    await expect(page.locator('#menuHaptics')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.vibrations)).toEqual([8]);
  });

  test('invalid guesses and wins have distinct feedback without an extra Enter tap pulse', async ({ page, deterministicLobby }) => {
    await recordVibrations(page);
    await deterministicLobby.openActive();
    await page.locator('.key[data-key="Enter"]').tap();
    expect(await page.evaluate(() => window.vibrations)).toEqual([[20, 40, 20]]);
    await page.route('**/lobby/ACT001/guess', route => route.fulfill({ json: {
      status: 'ok', won: true, over: true, pointsDelta: 8,
      state: FIXTURE_STATES.completed,
    } }));
    for (const letter of 'tar') await page.locator(`.key[data-key="${letter}"]`).tap();
    await page.evaluate(() => { window.vibrations = []; });
    await page.locator('.key[data-key="Enter"]').tap();
    await expect.poll(() => page.evaluate(() => window.vibrations)).toEqual([18, [20, 50, 30, 50, 40]]);
  });

  test('confirmed reset and successful invite copying provide feedback', async ({ page, deterministicLobby }) => {
    await recordVibrations(page);
    await deterministicLobby.openActive();
    await page.locator('#holdReset').dispatchEvent('touchstart');
    expect(await page.evaluate(() => window.vibrations)).toEqual([]);
    await expect.poll(() => page.evaluate(() => window.vibrations), { timeout: 4000 }).toEqual([25]);
    await page.locator('#holdReset').dispatchEvent('touchend');
    await page.locator('#copyLobbyLink').tap();
    await page.evaluate(() => {
      document.execCommand = () => true;
      window.vibrations = [];
    });
    await page.locator('#shareCopy').tap();
    expect(await page.evaluate(() => window.vibrations)).toEqual([18]);
  });

  test('unsupported browsers hide the toggle and keep keyboard input working', async ({ page, deterministicLobby }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => Object.defineProperty(navigator, 'vibrate', { value: undefined }));
    await deterministicLobby.openActive();
    await page.locator('.key[data-key="q"]').tap();
    await expect(page.locator('#guessInput')).toHaveValue('SQ');
    await page.locator('#optionsToggle').tap();
    await expect(page.locator('#menuHaptics')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('a refused vibration cannot interrupt input', async ({ page, deterministicLobby }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => Object.defineProperty(navigator, 'vibrate', {
      value() { throw new Error('Vibration denied'); },
    }));
    await deterministicLobby.openActive();
    await page.locator('.key[data-key="q"]').tap();
    await expect(page.locator('#guessInput')).toHaveValue('SQ');
    expect(errors).toEqual([]);
  });
});

test.describe('devices without touch input', () => {
  test.use({ hasTouch: false });
  test('do not expose or trigger phone haptics even if the API exists', async ({ page, deterministicLobby }) => {
    await recordVibrations(page);
    await deterministicLobby.openActive();
    await page.locator('.key[data-key="q"]').click();
    await page.locator('#optionsToggle').click();
    await expect(page.locator('#menuHaptics')).toBeHidden();
    expect(await page.evaluate(() => window.vibrations)).toEqual([]);
  });
});
