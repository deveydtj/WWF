/** Responsive gameplay regression checks using an initialized lobby. */

const {
  test,
  expect,
} = require('./fixtures/deterministic-lobby');

const PHONE_VIEWPORT = { width: 320, height: 568 };

async function settleLayout(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

function overlapArea(first, second) {
  const width = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x)
  );
  const height = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y)
  );
  return width * height;
}

test.describe('responsive gameplay regressions', () => {
  test.describe('touch-first phone input', () => {
    test.use({ hasTouch: true });

    test('virtual-key activation does not focus the word-entry field on touch layouts', async ({
      page,
      deterministicLobby,
    }) => {
      await page.setViewportSize(PHONE_VIEWPORT);
      await deterministicLobby.openActive();

      const guessInput = page.locator('#guessInput');
      await guessInput.blur();
      await page.locator('.key[data-key="q"]').click();

      await expect(guessInput).not.toBeFocused();
    });

    test('phone word entry is hidden, aria-hidden, and removed from tab order', async ({
      page,
      deterministicLobby,
    }) => {
      await page.setViewportSize(PHONE_VIEWPORT);
      await deterministicLobby.openActive();

      const guessInput = page.locator('#guessInput');
      await expect.soft(guessInput).toBeHidden();
      await expect.soft(guessInput).toHaveAttribute('aria-hidden', 'true');
      await expect(guessInput).toHaveAttribute('tabindex', '-1');
    });
  });

  test.describe('keyboard-first input', () => {
    test.use({ hasTouch: false, isMobile: false });

    test('word entry is visible and mirrors controller state', async ({
      page,
      deterministicLobby,
    }) => {
      await page.setViewportSize({ width: 1200, height: 900 });
      await deterministicLobby.openActive();

      const guessInput = page.locator('#guessInput');
      await expect(guessInput).toBeVisible();
      await expect(guessInput).not.toHaveAttribute('aria-hidden', 'true');
      await expect(guessInput).not.toHaveAttribute('tabindex', '-1');

      await page.locator('.key[data-key="q"]').click();
      await expect(guessInput).toHaveValue('SQ');
    });
  });

  test('tablet rail capacity falls back to modal presentation when height is constrained', async ({
    page,
    deterministicLobby,
  }) => {
    await page.setViewportSize({ width: 844, height: 1100 });
    await deterministicLobby.openActive();
    const tallCapacity = await page.evaluate(
      () => window.__wordSquadDebug.layout.getSnapshot().profile.panelCapacity
    );

    await page.setViewportSize({ width: 844, height: 390 });
    await settleLayout(page);
    const shortCapacity = await page.evaluate(
      () => window.__wordSquadDebug.layout.getSnapshot().profile.panelCapacity
    );

    expect(tallCapacity).toBe(1);
    expect(shortCapacity).toBe(0);
  });

  test('legacy scaling globals are absent from production', async ({
    page,
    deterministicLobby,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await deterministicLobby.openActive();

    const deprecatedGlobals = await page.evaluate(() => ({
      boardScalingTests: Object.hasOwn(window, 'boardScalingTests'),
      tuneSizing: Object.hasOwn(window, 'tuneSizing'),
      recalculateScaling: Object.hasOwn(window, 'recalculateScaling'),
      enhancedScaling: Object.hasOwn(window, 'enhancedScaling'),
    }));

    expect(deprecatedGlobals).toEqual({
      boardScalingTests: false,
      tuneSizing: false,
      recalculateScaling: false,
      enhancedScaling: false,
    });
  });

  test('compact gameplay has no keyboard overflow or board overlap', async ({
    page,
    deterministicLobby,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await deterministicLobby.openActive();
    await settleLayout(page);

    const boardBox = await page.locator('#board').boundingBox();
    const keyboardBox = await page.locator('#keyboard').boundingBox();
    expect(boardBox).not.toBeNull();
    expect(keyboardBox).not.toBeNull();

    expect.soft(keyboardBox.x).toBeGreaterThanOrEqual(0);
    expect.soft(keyboardBox.x + keyboardBox.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
    expect(overlapArea(boardBox, keyboardBox)).toBe(0);
  });
});
