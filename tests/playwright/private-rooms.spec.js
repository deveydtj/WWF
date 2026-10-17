const { test, expect } = require('@playwright/test');
const testUrl = process.env.WORDSQUAD_TEST_URL;
test.use({ baseURL: testUrl || 'http://127.0.0.1:5058', channel: 'chrome' });
test.skip(!testUrl, 'Use an isolated Flask server with WORDSQUAD_TEST_URL.');

async function eligible(context) {
  expect((await context.request.post('/age-check', { data: { age: 20 } })).ok()).toBe(true);
}

async function create(page, context) {
  await eligible(context);
  await page.goto('/');
  await page.locator('#emojiDisplay').click();
  await page.locator('#emojiChoices .emoji-choice').first().click();
  await page.locator('#privateRoom').check();
  await page.locator('#createBtn').click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.locator('#board .tile')).toHaveCount(30);
  await expect(page.locator('#lobbyCode')).toHaveText('Private room');
}

test('host approves a guest; concealed game survives reload and kick revokes access', async ({ page, context, browser }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await create(page, context);
  const code = await page.evaluate(() => sessionStorage.getItem('privateRoom'));
  expect(await page.evaluate(() => localStorage.getItem('hostToken'))).toBeNull();
  await page.locator('#copyLobbyLink').click();
  await page.keyboard.type('apple');
  await expect(page.locator('#guessInput')).toHaveValue('');
  await page.locator('#copyInvitation').click();
  await expect(page.locator('#privateRoomStatus')).toHaveText('Invitation copied. Send it privately.');
  const invitation = await page.evaluate(() => navigator.clipboard.readText());
  expect(invitation).toContain('/join#');
  expect(await page.locator('body').innerText()).not.toContain(invitation.split('#')[1]);
  await page.screenshot({ path: testInfo.outputPath('private-host-controls.png') });

  const guestContext = await browser.newContext({ baseURL: testUrl });
  try {
    const guest = await guestContext.newPage();
    const requests = [];
    guest.on('request', request => requests.push(request.url()));
    await guest.goto(invitation);
    await expect(guest).toHaveURL(/\/join$/);
    await guest.locator('#guestName').fill('Invited friend');
    await guest.locator('#privateJoinForm button').click();
    await guest.locator('#ageInput').fill('20');
    await guest.locator('#ageCheckForm button[type="submit"]').click();
    await expect(guest.locator('#joinStatus')).toContainText('Waiting for the host');
    expect((await guestContext.request.get(`/lobby/${code}/state`)).status()).toBe(404);
    await expect(page.getByRole('button', { name: 'Approve Invited friend', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Approve Invited friend', exact: true }).click();
    await expect(guest).toHaveURL(/\/game$/);
    await expect(guest.locator('#emojiModal')).toBeVisible();
    await guest.locator('#emojiChoices .emoji-choice').nth(1).click();
    await expect(guest.locator('#board .tile')).toHaveCount(30);
    await expect(guest.locator('#copyLobbyLink')).toBeHidden();
    await expect(guest.locator('#holdReset')).toBeHidden();
    expect(requests.every(url => !url.includes('#'))).toBe(true);
    const guestIdentity = await guest.evaluate(() => window.PRIVATE_ROOM.player_id);
    await guest.reload();
    await expect(guest.locator('#board .tile')).toHaveCount(30);
    expect(await guest.evaluate(() => window.PRIVATE_ROOM.player_id)).toBe(guestIdentity);
    await page.locator('#privateRoomDialog button', { hasText: 'Close' }).click();
    await page.reload();
    await expect(page.locator('#lobbyCode')).toHaveText('Private room');
    await expect(page.locator('#privateRoomDialog')).not.toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('private-game.png') });
    await page.locator('#playerToggle').click();
    const kickResponse = page.waitForResponse(response =>
      response.url().endsWith(`/lobby/${code}/kick`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Kick 🦊', exact: true }).click();
    expect((await kickResponse).status()).toBe(200);
    expect((await guestContext.request.get(`/lobby/${code}/state`)).status()).toBe(404);
    await guest.reload();
    await expect(guest.getByText('This private room is unavailable.', { exact: false })).toBeVisible();
  } finally {
    await guestContext.close();
  }
});

test('private rooms in different tabs keep their own selectors', async ({ page, context }) => {
  await create(page, context);
  const first = await page.evaluate(() => window.PRIVATE_ROOM.room);
  const tab = await context.newPage();
  await tab.goto('/');
  await tab.locator('#privateRoom').check();
  await tab.locator('#createBtn').click();
  await expect(tab).toHaveURL(/\/game$/);
  await expect(tab.locator('#board .tile')).toHaveCount(30);
  const second = await tab.evaluate(() => window.PRIVATE_ROOM.room);
  expect(second).not.toBe(first);
  await page.reload();
  await expect(page.locator('#board .tile')).toHaveCount(30);
  expect(await page.evaluate(() => window.PRIVATE_ROOM.room)).toBe(first);
  expect(await tab.evaluate(() => window.PRIVATE_ROOM.room)).toBe(second);
});
