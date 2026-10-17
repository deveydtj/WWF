const { test, expect } = require('./fixtures/deterministic-lobby');

test.use({ viewport: { width: 390, height: 700 }, hasTouch: true });

test('options close control stays square and clear of menu items', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await page.locator('#optionsToggle').click();
  await expect(page.locator('#optionsMenu')).toBeVisible();
  const close = await page.locator('#optionsClose').boundingBox();
  const firstItem = await page.locator('#menuHistory').boundingBox();
  expect(close.width).toBeLessThanOrEqual(48);
  expect(close.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(close.width - close.height)).toBeLessThan(1);
  expect(close.x + close.width <= firstItem.x || firstItem.x + firstItem.width <= close.x
    || close.y + close.height <= firstItem.y || firstItem.y + firstItem.height <= close.y).toBe(true);
  await page.locator('#optionsClose').click();
  await expect(page.locator('#optionsMenu')).toBeHidden();
});

test('invite link copies on an HTTP LAN origin without Clipboard API', async ({ page, deterministicLobby }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await deterministicLobby.openActive();
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  await page.evaluate(() => {
    window.copiedInvite = null;
    document.execCommand = (command) => {
      if (command !== 'copy') return false;
      const input = document.activeElement;
      window.copiedInvite = input.value.slice(input.selectionStart, input.selectionEnd);
      return true;
    };
  });
  await page.locator('#copyLobbyLink').click();
  await expect(page.locator('#shareModal')).toBeVisible();
  const inviteUrl = `${new URL(page.url()).origin}/invite.html#lobby/ACT001`;
  await expect(page.locator('#shareLink')).toHaveValue(inviteUrl);
  await page.locator('#shareCopy').click();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.copiedInvite)).toBe(inviteUrl);
});

test('native sharing includes the preview URL and the current lobby code', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await page.evaluate(() => {
    navigator.share = async data => { window.sharedInvitation = data; };
  });
  await page.locator('#copyLobbyLink').click();
  expect(await page.evaluate(() => window.sharedInvitation)).toEqual({
    title: 'Join my WordSquad game',
    text: 'Come play WordSquad with me!',
    url: `${new URL(page.url()).origin}/invite.html#lobby/ACT001`,
  });
});

test('game has no server waiting screen', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await expect(page.locator('#waitingOverlay')).toHaveCount(0);
  await expect(page.locator('#shareModal')).toBeHidden();
  await expect(page.locator('#infoPopup')).toBeHidden();
});

test('invite text and selection stay readable in both themes', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await page.locator('#copyLobbyLink').click();
  for (const dark of [false, true]) {
    await page.evaluate(dark => document.body.classList.toggle('dark-mode', dark), dark);
    const colors = await page.locator('#shareLink').evaluate(input => {
      input.focus();
      input.select();
      const text = getComputedStyle(input);
      const selection = getComputedStyle(input, '::selection');
      const rgba = color => color.match(/[\d.]+/g).map(Number);
      return {
        text: rgba(text.color), background: rgba(text.backgroundColor),
        selectedText: rgba(selection.color), selectedBackground: rgba(selection.backgroundColor),
      };
    });
    const luminance = rgb => rgb.slice(0, 3).map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(colors.selectedBackground[3] ?? 1, 'selection must use an opaque contrasting background').toBe(1);
    expect(contrast(colors.selectedText, colors.selectedBackground)).toBeGreaterThanOrEqual(4.5);
  }
});

for (const [width, height] of [[320, 568], [390, 700], [844, 390], [1440, 900]]) {
  test(`single options menu and header actions fit ${width}x${height}`, async ({ page, deterministicLobby }) => {
    await page.setViewportSize({ width, height });
    await deterministicLobby.openActive();
    await expect(page.locator('#mobileMenuToggle, #mobileMenuPopup')).toHaveCount(0);
    for (const id of ['copyLobbyLink', 'leaveLobby', 'playerToggle', 'optionsToggle']) {
      const control = page.locator(`#${id}`);
      await expect(control).toBeVisible();
      const rect = await control.boundingBox();
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    }
    await page.locator('#optionsToggle').click();
    const menu = page.locator('#optionsMenu');
    await expect(page.locator('#optionsClose')).toBeFocused();
    const rect = await menu.boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    // The last action remains reachable by scrolling in a short viewport.
    await page.locator('#menuInfo').scrollIntoViewIfNeeded();
    await page.locator('#menuInfo').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#optionsClose')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#menuInfo')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.locator('#optionsToggle')).toBeFocused();
  });
}

test('sound label follows the setting and initializes after reload', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await page.locator('#optionsToggle').click();
  const sound = page.locator('#menuSound');
  await expect(sound).toHaveText('🔇 Sound Off');
  await sound.click();
  await expect(sound).toHaveText('🔊 Sound On');
  expect(await page.evaluate(() => localStorage.getItem('soundEnabled'))).toBe('true');
  await page.reload();
  await page.locator('#optionsToggle').click();
  await expect(sound).toHaveText('🔊 Sound On');
  await sound.click();
  await expect(sound).toHaveText('🔇 Sound Off');
  expect(await page.evaluate(() => localStorage.getItem('soundEnabled'))).toBe('false');
});

test('Info inherits focus from Options and both dialogs release their traps', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator('#optionsToggle').click();
    await page.locator('#menuInfo').click();
    await expect(page.locator('#optionsMenu')).toBeHidden();
    await expect(page.locator('#infoClose')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#infoClose')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#infoPopup')).toBeHidden();
    await expect(page.locator('#optionsToggle')).toBeFocused();
  }
  await page.locator('#copyLobbyLink').click();
  await expect(page.locator('#shareLink')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#shareClose')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#shareLink')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#shareModal')).toBeHidden();
  await expect(page.locator('#copyLobbyLink')).toBeFocused();
});

test('rapid menu reopening has no delayed close callback', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await page.locator('#optionsToggle').click();
  await page.keyboard.press('Escape');
  await page.locator('#optionsToggle').click();
  // Cross the former animation timer so stale callbacks would hide the reopened menu.
  await page.waitForTimeout(350);
  await expect(page.locator('#optionsClose')).toBeFocused();
  await expect(page.locator('#optionsMenu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#optionsToggle')).toBeFocused();
});

test('Leave sends one request and waits before clearing the rejoin entry', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await page.evaluate(() => localStorage.setItem('lastLobby', 'ACT001'));
  await page.route('http://wordsquad.test/', route => route.fulfill({ contentType: 'text/html', body: '<title>Landing</title>' }));
  const leaveRequests = [];
  let finishLeave;
  const pendingLeave = new Promise(resolve => { finishLeave = resolve; });
  await page.route('**/lobby/ACT001/leave', async route => {
    leaveRequests.push(route.request().postDataJSON());
    await pendingLeave;
    await route.fulfill({ json: { status: 'ok' } });
  });
  await page.locator('#leaveLobby').click();
  await expect.poll(() => leaveRequests.length).toBe(1);
  // An immediate competing redirect would cancel the request and hide the game.
  await expect(page.locator('#board')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lastLobby'))).toBe('ACT001');
  finishLeave();
  await expect(page).toHaveTitle('Landing');
  expect(await page.evaluate(() => localStorage.getItem('lastLobby'))).toBeNull();
  expect(leaveRequests).toEqual([{ emoji: '🐶', player_id: 'fixture-player' }]);
});

for (const [width, height] of [[320, 568], [844, 390]]) {
  test(`Players close stays reachable and Options can reopen ${width}x${height}`, async ({ page, deterministicLobby }) => {
    await page.setViewportSize({ width, height });
    await deterministicLobby.openActive();
    await page.locator('#optionsToggle').click();
    await page.locator('#optionsClose').click();
    await page.locator('#playerToggle').click();
    await expect(page.locator('#optionsMenu')).toBeHidden();
    for (const id of ['playerSidebar', 'playerClose']) {
      const rect = await page.locator(`#${id}`).boundingBox();
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    }
    await page.locator('#playerClose').click();
    await page.locator('#optionsToggle').click();
    await expect(page.locator('#optionsClose')).toBeFocused();
    await expect(page.locator('#optionsMenu')).toBeVisible();
  });
}
