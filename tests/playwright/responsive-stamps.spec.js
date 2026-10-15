const { test, expect } = require('./fixtures/deterministic-lobby');

test('guess stamps remain visible and aligned while resizing gameplay', async ({
  page, deterministicLobby,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await deterministicLobby.openActive();
  await expect(page.locator('.emoji-stamp')).toHaveCount(2);

  for (const [width, height] of [[1440, 900], [901, 768], [900, 768], [768, 1024], [390, 844], [320, 568], [568, 320], [844, 390], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(
      () => requestAnimationFrame(() => requestAnimationFrame(resolve))
    )));
    for (const stamp of await page.locator('.emoji-stamp').all()) {
      await expect(stamp, `${width}x${height}: stamp is visible`).toBeVisible();
      const geometry = await stamp.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const index = Number(element.dataset.guessIndex);
        const tile = document.querySelectorAll('#board .tile')[index * 5].getBoundingClientRect();
        return { x: box.x, right: box.right, y: box.y, bottom: box.bottom,
          center: box.y + box.height / 2, rowCenter: tile.y + tile.height / 2,
          boardLeft: tile.x,
          overlapsControl: [...document.querySelectorAll('#boardArea button')].some((button) => {
            const control = button.getBoundingClientRect();
            return control.width > 0 && control.height > 0
              && box.left < control.right && box.right > control.left
              && box.top < control.bottom && box.bottom > control.top;
          }) };
      });
      expect(geometry.x).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(geometry.boardLeft);
      expect(geometry.right).toBeLessThanOrEqual(width);
      expect(geometry.y).toBeGreaterThanOrEqual(0);
      expect(geometry.bottom).toBeLessThanOrEqual(height);
      expect(Math.abs(geometry.center - geometry.rowCenter)).toBeLessThan(1);
      expect(geometry.overlapsControl).toBe(false);
    }
  }
});
