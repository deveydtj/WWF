const { test, expect } = require('./fixtures/deterministic-lobby');

async function measureLayout(page) {
  // Allow the viewport service and its container observer to commit.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(
    () => requestAnimationFrame(() => requestAnimationFrame(resolve))
  )));
  return page.evaluate(() => {
    const bounds = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        right: rect.right, bottom: rect.bottom };
    };
    return {
      board: bounds('#board'),
      keyboard: bounds('#keyboard'),
      controls: bounds('#inputArea'),
      tile: bounds('#board .tile:last-child'),
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

test('gameplay stays vertically stacked and reachable while resizing and zooming', async ({
  page, deterministicLobby,
}) => {
  await deterministicLobby.openActive();
  // Zoom changes the available CSS pixels, unlike deviceScaleFactor.
  const viewports = [
    [2560, 1440], [1920, 1080], [1440, 900], [1366, 768], [1024, 768],
    [960, 540], [720, 450],
    [844, 390], [667, 375], [600, 375], [568, 320], [390, 844], [360, 640], [320, 568],
    [768, 1024], [1440, 900],
  ];
  const failures = [];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.locator('#centerPanel').evaluate((panel) => panel.scrollTo(0, 0));
    const layout = await measureLayout(page);
    for (const name of ['board', 'keyboard', 'controls']) {
      const box = layout[name];
      if (box.x < -1 || box.y < -1 || box.right > width + 1) {
        failures.push(`${width}x${height}: ${name} outside viewport ${JSON.stringify(box)}`);
      }
      if (box.bottom > height + 1) {
        await page.locator(`#${name === 'controls' ? 'inputArea' : name}`).scrollIntoViewIfNeeded();
        const visibleBox = await page.locator(`#${name === 'controls' ? 'inputArea' : name}`).boundingBox();
        if (visibleBox.y < -1 || visibleBox.y + visibleBox.height > height + 1) {
          failures.push(`${width}x${height}: ${name} cannot be reached by scrolling`);
        }
      }
    }
    if (layout.board.bottom > layout.keyboard.y + 1
      && layout.keyboard.bottom > layout.board.y + 1
      && layout.board.right > layout.keyboard.x + 1
      && layout.keyboard.right > layout.board.x + 1) {
      failures.push(`${width}x${height}: board overlaps keyboard`);
    }
    if (layout.keyboard.height > 0 && layout.keyboard.y < layout.board.bottom - 1) {
      failures.push(`${width}x${height}: keyboard is beside the board instead of below it`);
    }
    if (Math.abs((layout.keyboard.x + layout.keyboard.width / 2)
      - (layout.board.x + layout.board.width / 2)) > 1) {
      failures.push(`${width}x${height}: keyboard is not centered below the board`);
    }
    if (Math.abs(layout.tile.width - layout.tile.height) > 1) {
      failures.push(`${width}x${height}: tiles are not square`);
    }
    if (layout.scrollWidth > width + 1) failures.push(`${width}x${height}: horizontal overflow`);
  }
  expect(failures).toEqual([]);
});

test('one-pixel breakpoint crossings do not jump board or keyboard size', async ({
  page, deterministicLobby,
}) => {
  await deterministicLobby.openActive();
  const jumps = [];
  for (const boundary of [375, 600, 768, 900, 1024, 1150, 1200, 1550]) {
    await page.setViewportSize({ width: boundary, height: 900 });
    const before = await measureLayout(page);
    await page.setViewportSize({ width: boundary + 1, height: 900 });
    const after = await measureLayout(page);
    for (const name of ['board', 'keyboard']) {
      for (const axis of ['width', 'height']) {
        const delta = Math.abs(after[name][axis] - before[name][axis]);
        if (delta > 3) jumps.push(`${boundary}→${boundary + 1}: ${name} ${axis} jumps ${delta.toFixed(1)}px`);
      }
    }
  }
  expect(jumps).toEqual([]);
});

test('edge controls and keyboard shadows fit inside the scrolling panel', async ({ page, deterministicLobby }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await deterministicLobby.openActive();
  for (const [width, height] of [[390, 844], [320, 568], [844, 390], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await measureLayout(page);
    const clipped = await page.evaluate(() => {
      const panel = document.getElementById('centerPanel').getBoundingClientRect();
      return [...document.querySelectorAll('#keyboard .key, #optionsToggle, #chatNotify')]
        .filter(element => element.getBoundingClientRect().width > 0)
        .flatMap(element => {
          const rect = element.getBoundingClientRect();
          const shadows = getComputedStyle(element).boxShadow.split(/,(?![^(]*\))/);
          return shadows.filter(shadow => !shadow.includes('inset')).flatMap(shadow => {
            const [x = 0, , blur = 0, spread = 0] = [...shadow.matchAll(/(-?[\d.]+)px/g)]
              .map(match => Number(match[1]));
            // A blur paints out to approximately 1.5 times its radius.
            const radius = blur * 1.5 + spread;
            return rect.left + x - radius < panel.left - 1 || rect.right + x + radius > panel.right + 1
              ? [element.id || element.dataset.key] : [];
          });
        });
    });
    expect(clipped, `${width}x${height}: shadows must clear the scroll container edges`).toEqual([]);
  }
});

test('panels follow available space and preserve chat drafts during live resizing', async ({
  page, deterministicLobby,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await deterministicLobby.openActive();
  await measureLayout(page);
  const keyboardFirst = await page.evaluate(() => (
    matchMedia('(pointer: fine)').matches && matchMedia('(hover: hover)').matches
  ));
  await expect(page.locator('#historyBox')).toHaveAttribute('role', 'complementary');
  await expect(page.locator('#definitionBox')).toHaveAttribute('aria-modal', keyboardFirst ? 'false' : 'true');

  await page.setViewportSize({ width: 720, height: 450 });
  await measureLayout(page);
  await expect(page.locator('#historyBox')).toBeHidden();
  await expect(page.locator('#definitionBox')).toBeHidden();
  await page.locator('#chatNotify').click();
  await page.locator('#chatInput').fill('Keep this draft');

  for (const [width, height] of [[390, 844], [1440, 900], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await measureLayout(page);
    const chat = page.locator('#chatBox');
    await expect(chat).toBeVisible();
    await expect(page.locator('#chatInput')).toHaveValue('Keep this draft');
    await expect(chat).toHaveAttribute('aria-modal', width === 1440 && keyboardFirst ? 'false' : 'true');
    const box = await chat.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    await expect(page.locator('#inputArea #resetWrapper')).toHaveCount(1);
  }
});
