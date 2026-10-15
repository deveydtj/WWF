const { test, expect } = require('./fixtures/deterministic-lobby');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('tapped keys animate and settle back to their resting position', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  for (const value of ['q', 'Backspace']) {
    const key = page.locator(`.key[data-key="${value}"]`);
    await key.tap();
    await expect(key).toHaveClass(/active-key-press/);
    await page.clock.runFor(300);
    await expect(key).not.toHaveClass(/active-key-press/);
    await expect.poll(() => key.evaluate(element => getComputedStyle(element).transform)).toBe('none');
    await expect.poll(() => key.evaluate(element => getComputedStyle(element).filter)).toBe('none');
  }
});

test('the lobby code appears only in its header, including after resizing', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await expect(page.locator('#lobbyCode')).toHaveText('ACT001');
  for (const width of [390, 1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('#gameTitle')).toHaveText('WordSquad');
  }
});

test('popup close controls use a text cross that follows the theme and closes on tap', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  for (const dark of [false, true]) {
    await page.evaluate(async dark => {
      const { applyDarkMode } = await import('/static/js/themeManager.js');
      applyDarkMode(dark);
    }, dark);
    for (const button of await page.locator('.close-btn').all()) {
      await expect(button).toHaveText('×');
      await expect(button).toHaveAttribute('aria-label', /^Close /);
      const color = await button.evaluate(element => getComputedStyle(element).color);
      expect(dark ? ['rgb(225, 225, 225)', 'rgb(255, 255, 255)'] : ['rgb(61, 74, 90)']).toContain(color);
    }
    await page.locator('#optionsToggle').tap();
    await page.screenshot({ path: test.info().outputPath(`close-controls-${dark ? 'dark' : 'light'}.png`) });
    await page.locator('#optionsClose').tap();
    await expect(page.locator('#optionsMenu')).toBeHidden();
  }
});
