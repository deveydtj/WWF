const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../frontend');

// Serve the real landing assets without a backend or network dependency.
test.beforeEach(async ({ page }) => {
  await page.route('http://wordsquad.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/lobbies/network') {
      return route.fulfill({ json: { lobbies: [] } });
    }
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
    const contentType = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)];
    if (!contentType || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType, body: fs.readFileSync(file) });
  });
});

function luminance(color) {
  return color.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

async function checkTheme(page, dark) {
  expect(await page.locator('html').evaluate(html => getComputedStyle(html).colorScheme)).toBe(dark ? 'dark' : 'light');
  for (const selector of ['body', '#mainHeader', '#heroCard', '#donationSection', '#joinCode', '#joinBtn', '.play-tiles span:nth-child(3)', '.donation-meter', '.donation-meter-label', '#donationPending', '#howTo', '#emojiModalBox']) {
    const colors = await page.locator(selector).evaluate(element => {
      const style = getComputedStyle(element);
      // All gradient stops must belong to the selected appearance.
      const backgrounds = style.backgroundImage === 'none'
        ? [style.backgroundColor]
        : style.backgroundImage.match(/rgba?\([^)]+\)/g).filter(color => !color.startsWith('rgba'));
      return { text: style.color, backgrounds };
    });
    for (const background of colors.backgrounds) {
      const brightness = luminance(background);
      expect(brightness, `${selector} surface in ${dark ? 'dark' : 'light'} mode`)[dark ? 'toBeLessThan' : 'toBeGreaterThan'](0.5);
      const text = luminance(colors.text);
      expect((Math.max(text, brightness) + 0.05) / (Math.min(text, brightness) + 0.05), `${selector} text contrast`).toBeGreaterThanOrEqual(4.5);
    }
  }
  for (const [selector, surface] of [
    ['#heroCard .card-eyebrow', '#heroCard'],
    ['#heroCard .card-description', '#heroCard'],
    ['#joinForm label', '#heroCard'],
    ['#donationStatus', '#donationSection'],
    ['#donationPercent', '.donation-meter-label'],
    ['#howTo .how-section p', '#howTo'],
  ]) {
    const text = luminance(await page.locator(selector).first().evaluate(element => getComputedStyle(element).color));
    const background = await page.locator(surface).evaluate(element => {
      const style = getComputedStyle(element);
      return style.backgroundImage === 'none' ? [style.backgroundColor]
        : style.backgroundImage.match(/rgba?\([^)]+\)/g).filter(color => !color.startsWith('rgba'));
    });
    for (const color of background) {
      const brightness = luminance(color);
      expect((Math.max(text, brightness) + 0.05) / (Math.min(text, brightness) + 0.05), `${selector} text contrast`).toBeGreaterThanOrEqual(4.5);
    }
  }
}

for (const width of [390, 1440]) {
  test(`landing surfaces follow the theme and persist after reload at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://wordsquad.test/');
    await expect(page.locator('#darkToggle')).toHaveAttribute('aria-label', 'Switch to dark mode');
    await checkTheme(page, false);
    await page.screenshot({ path: testInfo.outputPath('light.png'), fullPage: true });
    await page.locator('#darkToggle').click();
    await expect(page.locator('body')).not.toHaveClass(/theme-changing/);
    await checkTheme(page, true);
    await page.screenshot({ path: testInfo.outputPath('dark.png'), fullPage: true });
    await page.reload();
    await expect(page.locator('#darkToggle')).toHaveAttribute('aria-label', 'Switch to light mode');
    await checkTheme(page, true);
    await page.locator('#darkToggle').click();
    await page.reload();
    await expect(page.locator('#darkToggle')).toHaveAttribute('aria-label', 'Switch to dark mode');
    await checkTheme(page, false);
    await page.locator('#howToggle').click();
    await expect(page.locator('#howTo')).toBeVisible();
    await checkTheme(page, false);
    await page.locator('[aria-label="Close how to play"]').click();
    await page.locator('#emojiDisplay').click();
    await expect(page.locator('#emojiModalBox')).toBeVisible();
  });
}

test('How to Play focuses the heading initially and shows focus when tabbing to Close', async ({ page, browserName }) => {
  await page.goto('http://wordsquad.test/');
  await page.locator('#howToggle').click();
  const close = page.locator('[aria-label="Close how to play"]');
  await expect(page.locator('#howHeading')).toBeFocused();
  expect(await page.locator('#howHeading').evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none');
  expect(await close.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none');
  await page.screenshot({ path: test.info().outputPath('how-to-play-initial-focus.png') });
  // Safari uses Option-Tab to include buttons in keyboard navigation by default.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(close).toBeFocused();
  expect(await close.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(page.locator('#howTo')).toBeHidden();
  await expect(page.locator('#howToggle')).toBeFocused();
  expect(await page.locator('#howToggle').evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
});

test.describe('Main menu pointer focus', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('tapping menu buttons and closing their popups leaves no selection ring', async ({ page }) => {
    await page.goto('http://wordsquad.test/');
    for (const [trigger, close] of [
      ['#howToggle', '[aria-label="Close how to play"]'],
      ['#emojiDisplay', '#emojiPickerClose'],
      ['#darkToggle', null],
    ]) {
      const button = page.locator(trigger);
      await button.tap();
      if (close) await page.locator(close).tap();
      await expect(button).toBeFocused();
      expect(await button.evaluate(element => getComputedStyle(element).outlineStyle), trigger).toBe('none');
    }
  });
});
