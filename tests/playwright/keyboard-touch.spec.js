const { test, expect } = require('./fixtures/deterministic-lobby');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function center(key) {
  const box = await key.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('a drag starting on the keyboard never scrolls its parent', async ({ page, deterministicLobby, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native touch dragging requires the Chromium DevTools protocol.');
  await deterministicLobby.openActive();
  // Exercise the real scroll ancestor even on a screen tall enough to fit the game.
  await page.addStyleTag({ content: '#gameColumn { min-height: 1200px !important; }' });
  const key = await center(page.locator('.key[data-key="q"]'));
  const scrollTop = await page.locator('#centerPanel').evaluate(el => el.scrollTop);
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [key] });
  for (let distance = 10; distance <= 100; distance += 10) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: key.x, y: key.y - distance }],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  expect(await page.locator('#centerPanel').evaluate(el => el.scrollTop)).toBe(scrollTop);
  // A drag elsewhere must still scroll the same container.
  const board = await center(page.locator('#board'));
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [board] });
  for (let distance = 10; distance <= 100; distance += 10) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: board.x, y: board.y - distance }],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('#centerPanel').evaluate(el => el.scrollTop)).toBeGreaterThan(scrollTop);
});

test('holding and sliding previews keys and enters only the released key', async ({ page, deterministicLobby, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native touch dragging requires the Chromium DevTools protocol.');
  await deterministicLobby.openActive();
  const session = await page.context().newCDPSession(page);
  const q = page.locator('.key[data-key="q"]');
  const w = page.locator('.key[data-key="w"]');
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await center(q)] });
  await expect(q).toHaveClass(/touch-preview/);
  await expect(page.locator('#guessInput')).toHaveValue('');
  await page.screenshot({ path: test.info().outputPath('keyboard-preview.png') });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [await center(w)] });
  await expect(w).toHaveClass(/touch-preview/);
  await expect(q).not.toHaveClass(/touch-preview/);
  await expect(page.locator('#guessInput')).toHaveValue('');
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#guessInput')).toHaveValue('SW');
  await expect(page.locator('.touch-preview')).toHaveCount(0);
  await expect(w).toBeFocused();
});

// Use DOM events for cancellation and multi-touch coverage in WebKit as well.
async function touchEvent(page, type, points) {
  return page.locator('#keyboard').evaluate((keyboard, { type, points }) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'changedTouches', {
      value: points.map(({ x, y, id = 1 }) => ({ clientX: x, clientY: y, identifier: id })),
    });
    keyboard.dispatchEvent(event);
    return event.defaultPrevented;
  }, { type, points });
}

for (const scenario of ['active', 'completed']) {
  test(`top-row previews paint above Guess and ${scenario === 'active' ? 'Reset' : 'New Game'}`, async ({ page, deterministicLobby }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await deterministicLobby.open(scenario);
    await page.evaluate(async dark => {
      const { applyDarkMode } = await import('/static/js/themeManager.js');
      applyDarkMode(dark);
    }, scenario === 'active');
    await page.addStyleTag({ content: '.key.touch-preview::before { pointer-events: auto; }' });
    for (const control of ['submitGuess', 'holdReset']) {
      const keyValue = await page.evaluate(control => {
        const button = document.getElementById(control).getBoundingClientRect();
        return Array.from(document.querySelectorAll('.keyboard-row:first-child .key')).find(key => {
          const bounds = key.getBoundingClientRect();
          const center = bounds.left + bounds.width / 2;
          return center > button.left && center < button.right;
        }).dataset.key;
      }, control);
      const key = page.locator(`.key[data-key="${keyValue}"]`);
      const point = await center(key);
      await touchEvent(page, 'touchstart', [point]);
      const topKey = await key.evaluate((element, control) => {
        const bounds = element.getBoundingClientRect();
        const cap = getComputedStyle(element, '::before');
        const capBottom = bounds.bottom - parseFloat(cap.bottom);
        const button = document.getElementById(control).getBoundingClientRect();
        const top = Math.max(button.top, capBottom - parseFloat(cap.height) + 12);
        const bottom = Math.min(button.bottom, capBottom - 4);
        if (bottom <= top) throw new Error('The preview must overlap the control to test stacking.');
        return document.elementFromPoint(bounds.left + bounds.width / 2, (top + bottom) / 2)?.dataset.key;
      }, control);
      expect(topKey).toBe(keyValue);
      await page.screenshot({ path: test.info().outputPath(`keyboard-preview-${scenario}-${control}.png`) });
      await touchEvent(page, 'touchcancel', [point]);
    }
  });
}

test('leaving the keyboard or cancelling a touch clears the preview without typing', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  const q = page.locator('.key[data-key="q"]');
  const point = await center(q);
  const outside = { x: 1, y: 1 };
  expect(await touchEvent(page, 'touchstart', [point])).toBe(true);
  await expect(q).toHaveClass(/touch-preview/);
  await touchEvent(page, 'touchmove', [outside]);
  await expect(page.locator('.touch-preview')).toHaveCount(0);
  await touchEvent(page, 'touchend', [outside]);
  await expect(page.locator('#guessInput')).toHaveValue('');
  await touchEvent(page, 'touchstart', [point]);
  await touchEvent(page, 'touchcancel', [point]);
  await expect(page.locator('.touch-preview')).toHaveCount(0);
  await expect(page.locator('#guessInput')).toHaveValue('');
  await q.tap();
  await expect(page.locator('#guessInput')).toHaveValue('SQ');
});

test('two thumbs preview independently and each release enters once', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  const q = { ...await center(page.locator('.key[data-key="q"]')), id: 1 };
  const p = { ...await center(page.locator('.key[data-key="p"]')), id: 2 };
  await touchEvent(page, 'touchstart', [q]);
  await touchEvent(page, 'touchstart', [p]);
  await expect(page.locator('.touch-preview')).toHaveCount(2);
  await touchEvent(page, 'touchend', [q]);
  await expect(page.locator('#guessInput')).toHaveValue('SQ');
  await expect(page.locator('.touch-preview')).toHaveCount(1);
  await touchEvent(page, 'touchend', [p]);
  await expect(page.locator('#guessInput')).toHaveValue('SQP');
  await expect(page.locator('.touch-preview')).toHaveCount(0);
});

test('previews stay inside a narrow screen and respect reduced motion and theme colors', async ({ page, deterministicLobby }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await deterministicLobby.openActive();
  for (const dark of [false, true]) {
    await page.evaluate(async dark => {
      const { applyDarkMode } = await import('/static/js/themeManager.js');
      applyDarkMode(dark);
    }, dark);
    for (const value of ['q', 'p', 'a', 'l', 'Enter', 'Backspace']) {
      const key = page.locator(`.key[data-key="${value}"]`);
      const point = await center(key);
      await touchEvent(page, 'touchstart', [point]);
      const cap = await key.evaluate(element => {
        const style = getComputedStyle(element, '::before');
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left + parseFloat(style.left),
          right: bounds.left + parseFloat(style.left) + parseFloat(style.width),
          top: bounds.top - parseFloat(style.bottom) - parseFloat(style.height) + bounds.height,
          background: style.backgroundColor,
          keyBackground: getComputedStyle(element).backgroundColor,
          animation: style.animationName,
          content: style.content,
        };
      });
      expect(cap.left).toBeGreaterThanOrEqual(0);
      expect(cap.right).toBeLessThanOrEqual(320);
      expect(cap.top).toBeGreaterThanOrEqual(0);
      expect(cap.background).toBe(cap.keyBackground);
      expect(cap.animation).toBe('none');
      if (value === 'Backspace') expect(cap.content).toBe('"⌫"');
      if (value === 'Enter') expect(cap.content).toBe('"Guess"');
      await touchEvent(page, 'touchcancel', [point]);
    }
  }
  await page.screenshot({ path: test.info().outputPath('keyboard-preview-narrow-dark.png') });
});
