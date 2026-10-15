const { test, expect } = require('./fixtures/deterministic-lobby');

async function checkSurface(page, selector) {
  const surface = page.locator(selector);
  await expect(surface).toBeVisible();
  await surface.evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  const result = await surface.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    // Canvas resolves both rgb() and color-mix() computed colors to sRGB.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const luminance = color => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      return rgb.map(channel => channel / 255).map(value => value <= 0.04045
        ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    };
    const text = luminance(style.color);
    const colors = ['--popup-surface', '--bg-color'].map(name => luminance(style.getPropertyValue(name)));
    return {
      fits: bounds.left >= -1 && bounds.top >= -1
        && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1,
      scrollsHorizontally: element.scrollWidth > element.clientWidth + 1,
      contrast: Math.min(...colors.map(bg => (Math.max(bg, text) + 0.05) / (Math.min(bg, text) + 0.05))),
      border: style.borderTopStyle,
      radius: parseFloat(style.borderTopLeftRadius),
    };
  });
  expect(result.fits, selector).toBe(true);
  expect(result.scrollsHorizontally, selector).toBe(false);
  expect(result.contrast, selector).toBeGreaterThanOrEqual(4.5);
  expect(result.border, selector).toBe('solid');
  expect(result.radius, selector).toBeGreaterThanOrEqual(16);
  for (const button of await surface.locator('.popup-header button').all()) {
    if (!await button.isVisible()) continue;
    const bounds = await button.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
}

for (const viewport of [{ width: 320, height: 568 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  for (const dark of [false, true]) {
    test(`popup categories fit and match ${dark ? 'dark' : 'light'} theme at ${viewport.width}px`, async ({ page, deterministicLobby }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(dark => localStorage.setItem('darkMode', String(dark)), dark);
      await deterministicLobby.openActive();
      for (const [dialog, shell] of [
        ['emojiModal', 'emojiModalBox'], ['shareModal', 'shareBox'],
        ['infoPopup', 'infoBox'], ['closeCallPopup', 'closeCallBox'],
      ]) {
        await page.evaluate(async id => {
          const { openDialog } = await import('/static/js/utils.js');
          if (id === 'emojiModal') {
            const { showEmojiModal } = await import('/static/js/emoji.js');
            showEmojiModal(['🦊'], { onChosen() {} });
          } else {
            document.getElementById('shareLink').value = location.href;
            document.getElementById('closeCallText').textContent = '🦊 beat you by 120ms. Try again next round!';
            openDialog(document.getElementById(id), document.getElementById('optionsToggle'));
          }
        }, dialog);
        await checkSurface(page, `#${shell}`);
        await page.screenshot({ path: testInfo.outputPath(`${shell}.png`) });
        await page.keyboard.press('Escape');
        await expect(page.locator(`#${dialog}`)).toBeHidden();
      }
      for (const [menuItem, shell, key] of [
        ['#menuHistory', '#historyBox', 'history'],
        ['#menuDefinition', '#definitionBox', 'definition'],
        ['#menuChat', '#chatBox', 'chat'],
      ]) {
        await page.locator('#optionsToggle').click();
        await checkSurface(page, '#optionsMenu');
        await page.screenshot({ path: testInfo.outputPath('options.png') });
        await page.locator(menuItem).click();
        await checkSurface(page, shell);
        await page.screenshot({ path: testInfo.outputPath(`${key}.png`) });
        const close = page.locator(`${shell} .close-btn`);
        if (await close.isVisible()) await close.click();
      }
      await page.locator('#playerToggle').click();
      await checkSurface(page, '#playerSidebar');
      await page.screenshot({ path: testInfo.outputPath('players.png') });
    });
  }
}

test('chat previews render untimestamped messages safely and replace the previous timer', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await page.clock.install();
  const show = async text => page.evaluate(async text => {
    const { showChatMessagePopup } = await import('/static/js/uiNotifications.js');
    showChatMessagePopup({ emoji: '🦊', text });
  }, text);
  await show('First message');
  const popup = page.locator('#chatMessagePopup');
  await expect(popup.locator('.popup-emoji')).toHaveText('🦊');
  await expect(popup.locator('.popup-text')).toHaveText('First message');
  await page.clock.runFor(2500);
  await show('<b>Second message</b>');
  await page.clock.runFor(1600);
  await expect(popup).toBeVisible();
  await expect(popup.locator('.popup-text')).toHaveText('<b>Second message</b>');
  await expect(popup.locator('b')).toHaveCount(0);
  await page.clock.runFor(2500);
  await expect(popup).toBeHidden();
});

test('reduced motion keeps feedback readable and dismisses it without travel', async ({ page, deterministicLobby }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await deterministicLobby.openActive();
  await page.clock.install();
  await page.evaluate(async () => {
    const { showMessage, openDialog } = await import('/static/js/utils.js');
    const { showPointsDelta, showChatMessagePopup } = await import('/static/js/uiNotifications.js');
    showMessage('Link copied!', { messageEl: document.getElementById('message'), messagePopup: document.getElementById('messagePopup') });
    showPointsDelta(3);
    showChatMessagePopup({ emoji: '🐼', text: 'Ready for another round?' });
    openDialog(document.getElementById('infoPopup'));
  });
  expect(await page.locator('#infoBox').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  for (const selector of ['#messagePopup', '#pointsPopup', '#chatMessagePopup']) {
    const style = await page.locator(selector).evaluate(element => {
      const css = getComputedStyle(element);
      return { opacity: css.opacity, animation: css.animationName, pointerEvents: css.pointerEvents };
    });
    expect(style).toEqual({ opacity: '1', animation: 'popup-still', pointerEvents: 'none' });
  }
  await page.clock.runFor(4100);
  await expect(page.locator('#messagePopup')).toBeHidden();
  await expect(page.locator('#pointsPopup')).toBeHidden();
  await expect(page.locator('#chatMessagePopup')).toBeHidden();
});

test('replacing a score badge cancels the earlier dismissal', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await expect(page.locator('#chatMessagePopup')).toBeHidden();
  await page.clock.install();
  const show = delta => page.evaluate(async delta => {
    const { showPointsDelta } = await import('/static/js/uiNotifications.js');
    showPointsDelta(delta);
  }, delta);
  await show(3);
  await page.clock.runFor(1000);
  await show(-1);
  await page.clock.runFor(700);
  await expect(page.locator('#pointsPopup')).toBeVisible();
  await expect(page.locator('#pointsPopup')).toHaveText('-1');
  await expect(page.locator('#pointsPopup')).toHaveClass('points-negative');
  await page.clock.runFor(1100);
  await expect(page.locator('#pointsPopup')).toBeHidden();
});

test('landing emoji picker traps focus, closes with Escape, and selects with the keyboard', async ({ page }) => {
  const fs = require('fs');
  const path = require('path');
  await page.route('http://wordsquad.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/lobbies/network') return route.fulfill({ json: { lobbies: [] } });
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(__dirname, '../../frontend', name);
    const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(name)];
    if (!contentType || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType, body: fs.readFileSync(file) });
  });
  await page.goto('http://wordsquad.test/');
  await page.locator('#emojiDisplay').click();
  await expect(page.locator('#emojiChoices button').first()).toBeFocused();
  await page.locator('#emojiChoices button').last().focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#emojiPickerClose')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#emojiChoices button').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#emojiModal')).toBeHidden();
  await expect(page.locator('#emojiDisplay')).toBeFocused();
  await page.locator('#emojiDisplay').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('#emojiModal')).toBeHidden();
  await expect(page.locator('#emojiDisplay')).toHaveText('🐶');
});
