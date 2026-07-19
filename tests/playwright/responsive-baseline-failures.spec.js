/**
 * Phase 0.5 responsive baseline failures.
 *
 * These tests express the target behavior and are intentionally marked as
 * expected failures while the corresponding refactor phases are pending. An
 * unexpected pass means the behavior was fixed and the marker should be
 * removed so the test becomes a normal regression check.
 */

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

test.describe('Phase 0.5 expected responsive failures', () => {
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
    test.fail(true, 'Baseline: the phone guess field remains a visible, tabbable input.');

    await page.setViewportSize(PHONE_VIEWPORT);
    await deterministicLobby.openActive();

    const guessInput = page.locator('#guessInput');
    await expect.soft(guessInput).toBeHidden();
    await expect.soft(guessInput).toHaveAttribute('aria-hidden', 'true');
    await expect(guessInput).toHaveAttribute('tabindex', '-1');
  });

  test('tablet rail capacity falls back to modal presentation when height is constrained', async ({
    page,
    deterministicLobby,
  }) => {
    test.fail(true, 'Baseline: tablet rail capacity is selected from width without a height fit check.');

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

  test('cross-device scaling helper measures each requested viewport', async ({
    page,
    deterministicLobby,
  }) => {
    test.fail(true, 'Baseline: the helper repeats the live viewport measurement under different device names.');

    await page.setViewportSize({ width: 1024, height: 768 });
    await deterministicLobby.openActive();

    const results = await page.evaluate(
      () => window.boardScalingTests.testBoardScalingAcrossDevices().testResults
    );

    expect(results).toHaveLength(10);
    for (const result of results) {
      expect(result.verification.viewport).toEqual(result.dimensions);
    }
  });

  test('compact gameplay has no keyboard overflow or board overlap', async ({
    page,
    deterministicLobby,
  }) => {
    test.fail(true, 'Baseline: legacy tests allow keyboard overflow and up to 25% board/keyboard overlap.');

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
