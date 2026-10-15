const { test, expect, FIXTURE_STATES } = require('./fixtures/deterministic-lobby');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('holding Reset on a phone sends one reset request', async ({ page, deterministicLobby, browserName }) => {
  test.skip(browserName !== 'chromium', 'A sustained native touch requires the Chromium DevTools protocol.');
  await deterministicLobby.openActive();
  let resets = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/reset')) resets += 1;
  });
  const button = page.locator('#holdReset');
  const bounds = await button.boundingBox();
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }],
  });
  await expect.poll(() => resets, { timeout: 4000 }).toBe(1);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(resets).toBe(1);
});

test('tapping New Game after a game ends resets once and enables the next round', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openCompleted();
  await expect(page.locator('#holdReset')).toHaveText('New Game');
  await expect(page.locator('#guessInput')).toBeDisabled();
  await page.route('**/lobby/END001/state*', route => route.fulfill({ json: FIXTURE_STATES.active }));
  let resets = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/reset')) resets += 1;
  });
  await page.locator('#holdReset').tap();
  await expect.poll(() => resets).toBe(1);
  await expect(page.locator('#guessInput')).toBeEnabled();
  await expect(page.locator('#holdReset')).toHaveText('Reset');
  await page.locator('.key[data-key="q"]').tap();
  await expect(page.locator('#guessInput')).toHaveValue('SQ');
});
