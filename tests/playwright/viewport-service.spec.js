const { test, expect } = require('./fixtures/deterministic-lobby');

test.describe('ViewportService', () => {
  test.beforeEach(async ({ deterministicLobby }) => {
    await deterministicLobby.openActive();
  });

  test('captures normalized viewport, container, and capability state', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });

    const snapshot = await page.evaluate(async () => {
      const { ViewportService } = await import('/static/js/layout/viewportService.js');
      const service = new ViewportService();
      const current = service.start();
      service.destroy();
      return current;
    });

    expect(snapshot.layoutViewport).toEqual({ width: 1000, height: 700 });
    expect(snapshot.visualViewport).toEqual({
      width: 1000,
      height: 700,
      offsetTop: 0,
      offsetLeft: 0,
    });
    expect(snapshot.appContainer.width).toBeGreaterThan(0);
    expect(snapshot.appContainer.height).toBeGreaterThan(0);
    expect(snapshot.gameplayContainer.width).toBeGreaterThan(0);
    expect(snapshot.gameplayContainer.height).toBeGreaterThan(0);
    expect(snapshot.safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(snapshot.orientation).toBe('landscape');
    expect(snapshot.aspectRatio).toBeCloseTo(1.4286, 4);
    expect(['coarse', 'fine', 'mixed']).toContain(snapshot.pointer);
    expect(typeof snapshot.hover).toBe('boolean');
    expect(typeof snapshot.anyHover).toBe('boolean');
  });

  test('publishes only changed snapshots and observes both containers', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const app = document.createElement('div');
      const gameplay = document.createElement('div');
      app.style.cssText = 'position:fixed;width:400px;height:300px';
      gameplay.style.cssText = 'width:250px;height:180px';
      app.appendChild(gameplay);
      document.body.appendChild(app);

      const { ViewportService } = await import('/static/js/layout/viewportService.js');
      const service = new ViewportService({ appContainer: app, gameplayContainer: gameplay });
      const snapshots = [];
      service.subscribe((snapshot) => snapshots.push(snapshot));

      service.scheduleUpdate();
      service.scheduleUpdate();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const unchangedCount = snapshots.length;

      gameplay.style.width = '275px';
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 500);
        const unsubscribe = service.subscribe((snapshot, previous) => {
          if (previous && snapshot.gameplayContainer.width === 275) {
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          }
        }, { emitCurrent: false });
      });

      const changedCount = snapshots.length;
      const finalSnapshot = service.getSnapshot();
      service.destroy();
      app.remove();

      return { unchangedCount, changedCount, finalSnapshot };
    });

    expect(result.unchangedCount).toBe(1);
    expect(result.changedCount).toBe(2);
    expect(result.finalSnapshot.appContainer).toEqual({ width: 400, height: 300 });
    expect(result.finalSnapshot.gameplayContainer).toEqual({ width: 275, height: 180 });
  });

  test('publishes updated orientation after a viewport resize', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await page.evaluate(async () => {
      const { ViewportService } = await import('/static/js/layout/viewportService.js');
      const service = new ViewportService();
      window.__viewportServiceTest = service;
      window.__viewportSnapshots = [];
      service.subscribe((snapshot) => window.__viewportSnapshots.push(snapshot));
    });

    await page.setViewportSize({ width: 500, height: 800 });
    await expect.poll(() => page.evaluate(
      () => window.__viewportServiceTest.getSnapshot().orientation
    )).toBe('portrait');

    const snapshots = await page.evaluate(() => {
      const result = window.__viewportSnapshots;
      window.__viewportServiceTest.destroy();
      return result;
    });

    expect(snapshots.at(-1).layoutViewport).toEqual({ width: 500, height: 800 });
    expect(snapshots.at(-1).aspectRatio).toBe(0.625);
  });
});
