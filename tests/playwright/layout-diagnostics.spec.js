const {
  test,
  expect,
} = require('./fixtures/deterministic-lobby');

test.describe('test-only layout diagnostics', () => {
  test('exposes the current profile, capacity, and viewport bounds', async ({ page, deterministicLobby }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await deterministicLobby.openActive();

    const snapshot = await page.evaluate(() => window.__wordSquadDebug.layout.getSnapshot());
    const boardBounds = await page.locator('#board').boundingBox();
    const keyboardBounds = await page.locator('#keyboard').boundingBox();

    expect(snapshot.profile).toEqual({
      mode: 'desktop',
      historyPopup: false,
      panelCapacity: 2,
    });
    expect(snapshot.metrics.layoutViewport).toEqual({ width: 1280, height: 800 });
    expect(snapshot.metrics.visualViewport).toMatchObject({
      width: 1280,
      height: 800,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
    });
    expect(snapshot.metrics.boardBounds).toMatchObject(boardBounds);
    expect(snapshot.metrics.keyboardBounds).toMatchObject(keyboardBounds);
  });

  test('reads live values after the layout changes', async ({ page, deterministicLobby }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await deterministicLobby.openActive();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => page.evaluate(
      () => window.__wordSquadDebug.layout.getSnapshot().profile.mode
    )).toBe('phone');

    const snapshot = await page.evaluate(() => window.__wordSquadDebug.layout.getSnapshot());
    expect(snapshot.profile.panelCapacity).toBe(0);
    expect(snapshot.metrics.layoutViewport).toEqual({ width: 390, height: 844 });
    expect(snapshot.metrics.boardBounds).not.toBeNull();
    expect(snapshot.metrics.keyboardBounds).not.toBeNull();
  });

  test('does not install unless the test flag is enabled', async ({ page, deterministicLobby }) => {
    await deterministicLobby.openActive();

    const result = await page.evaluate(async () => {
      delete window.__wordSquadDebug;
      delete window.__WORD_SQUAD_TEST_DIAGNOSTICS__;
      const diagnostics = await import('/static/js/layoutDiagnostics.js');
      const installed = diagnostics.installLayoutDiagnostics(() => ({ mode: 'phone' }));
      return {
        installed,
        hasNamespace: Object.hasOwn(window, '__wordSquadDebug'),
      };
    });

    expect(result).toEqual({ installed: false, hasNamespace: false });
  });
});
