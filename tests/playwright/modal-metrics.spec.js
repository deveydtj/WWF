const {
  test,
  expect,
} = require('./fixtures/deterministic-lobby');

test.describe('Phase 4.5 consolidated modal metrics', () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true });

  test('long modal content scrolls while its close control stays visible', async ({
    page,
    deterministicLobby,
  }) => {
    await deterministicLobby.openActive();
    await page.evaluate(() => {
      const popup = document.getElementById('infoPopup');
      popup.style.display = 'flex';
      popup.classList.add('show');
    });

    const popup = page.locator('#infoPopup');
    const shell = page.locator('#infoBox');
    const content = page.locator('#infoContent');
    const close = page.locator('#infoClose');
    await expect(popup).toBeVisible();

    const geometry = await page.evaluate(() => {
      const rect = (id) => {
        const bounds = document.getElementById(id).getBoundingClientRect();
        return {
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          left: bounds.left,
        };
      };
      const rootStyles = getComputedStyle(document.documentElement);
      const contentElement = document.getElementById('infoContent');
      return {
        shell: rect('infoBox'),
        close: rect('infoClose'),
        modalMaxInlineSize: parseFloat(rootStyles.getPropertyValue('--modal-max-inline-size')),
        modalMaxBlockSize: parseFloat(rootStyles.getPropertyValue('--modal-max-block-size')),
        contentOverflowY: getComputedStyle(contentElement).overflowY,
        contentClientHeight: contentElement.clientHeight,
        contentScrollHeight: contentElement.scrollHeight,
      };
    });

    expect(geometry.shell.left).toBeGreaterThanOrEqual(0);
    expect(geometry.shell.top).toBeGreaterThanOrEqual(0);
    expect(geometry.shell.right).toBeLessThanOrEqual(320);
    expect(geometry.shell.bottom).toBeLessThanOrEqual(568);
    expect(geometry.close.left).toBeGreaterThanOrEqual(geometry.shell.left);
    expect(geometry.close.top).toBeGreaterThanOrEqual(geometry.shell.top);
    expect(geometry.close.right).toBeLessThanOrEqual(geometry.shell.right);
    expect(geometry.close.bottom).toBeLessThanOrEqual(geometry.shell.bottom);
    expect(geometry.modalMaxInlineSize).toBeLessThanOrEqual(320 * 0.9);
    expect(geometry.modalMaxBlockSize).toBeLessThanOrEqual(568 * 0.85);
    expect(geometry.contentOverflowY).toBe('auto');
    expect(geometry.contentScrollHeight).toBeGreaterThan(geometry.contentClientHeight);

    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(close).toBeInViewport();
  });
});
