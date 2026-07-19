const {
  test,
  expect,
} = require('./fixtures/deterministic-lobby');

test.describe('on-screen keyboard layout', () => {
  test('uses layout tokens without scaling the keyboard container', async ({
    page,
    deterministicLobby,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await deterministicLobby.openActive();

    await expect(page.locator('#keyboard')).toBeVisible();

    const geometry = await page.evaluate(() => {
      const keyboard = document.getElementById('keyboard');
      const key = keyboard.querySelector('.key');
      const rootStyles = getComputedStyle(document.documentElement);
      const keyRect = key.getBoundingClientRect();

      return {
        keyboardTransform: getComputedStyle(keyboard).transform,
        keyHeightToken: parseFloat(
          rootStyles.getPropertyValue('--keyboard-key-height')
        ),
        renderedKeyHeight: keyRect.height,
        layoutKeyHeight: key.offsetHeight,
      };
    });

    expect(geometry.keyboardTransform).toBe('none');
    expect(geometry.renderedKeyHeight).toBeCloseTo(geometry.keyHeightToken, 4);
    expect(geometry.renderedKeyHeight).toBeCloseTo(geometry.layoutKeyHeight, 4);
  });
});
