const { test, expect } = require('@playwright/test');

const testUrl = process.env.WORDSQUAD_TEST_URL;
test.use({ baseURL: testUrl || 'http://127.0.0.1:5057', channel: 'chrome' });
test.skip(!testUrl, 'Run against an isolated Flask server using WORDSQUAD_TEST_URL.');

async function answerAge(page, age) {
  await page.locator('#ageInput').fill(String(age));
  await page.locator('#ageCheckForm button[type="submit"]').click();
}

test('landing does not discover lobbies before screening; screen is neutral and cancellable', async ({ page }, testInfo) => {
  const requests = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.goto('/');
  await page.locator('#createBtn').click();
  await expect(page.locator('#ageCheckDialog')).toBeVisible();
  await expect(page.locator('#ageInput')).toHaveValue('');
  expect(await page.locator('#ageCheckDialog').innerText()).not.toMatch(/13|older|under/);
  expect(requests).not.toContain('/lobbies/network');
  expect(requests).not.toContain('/lobby');
  const size = await page.locator('#ageCheckDialog').boundingBox();
  expect(size.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({ path: testInfo.outputPath('neutral-age-screen.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#ageCheckDialog')).toHaveCount(0);
  expect(requests).not.toContain('/lobby');
});

test('under13 direct lobby visitors remain blocked after retry and reload', async ({ page, context }) => {
  await page.goto('/lobby/AGE001');
  await expect(page).toHaveURL(/\/age-check\?next=/);
  await answerAge(page, 12);
  await expect(page.locator('#ageBlockedMessage')).toBeVisible();
  await expect(page.locator('#ageInput')).toBeHidden();
  const retry = await context.request.post('/age-check', { data: { age: 40 } });
  expect(retry.status()).toBe(403);
  await page.reload();
  await expect(page.locator('#ageBlockedMessage')).toBeVisible();
  expect((await context.request.get('/lobby/AGE001/state')).status()).toBe(403);
  await page.locator('#ageCheckClose').click();
  await page.getByRole('link', { name: 'Back to the home page' }).click();
  await page.locator('#createBtn').click();
  await expect(page.locator('#ageBlockedMessage')).toBeVisible();
  expect((await context.request.post('/lobby')).status()).toBe(403);
});

test('age13 player creates a lobby, chats and reloads without another age question', async ({ page, context }) => {
  await page.goto('/');
  await page.locator('#emojiDisplay').click();
  await page.locator('#emojiChoices .emoji-choice').first().click();
  await page.locator('#createBtn').click();
  await answerAge(page, 13);
  await expect(page).toHaveURL(/#lobby\/[A-Za-z0-9]{6}$/);
  const game = page.frameLocator('#lobbyView iframe');
  await expect(game.locator('#board .tile')).toHaveCount(30);
  await expect(page.locator('#ageCheckDialog')).toHaveCount(0);
  await game.locator('#chatNotify').click();
  await game.locator('#chatInput').fill('Age screen verified');
  await game.locator('#chatSend').click();
  await expect(game.locator('#chatMessages')).toContainText('Age screen verified');
  await page.reload();
  await expect(game.locator('#board .tile')).toHaveCount(30);
  await expect(page.locator('#ageCheckDialog')).toHaveCount(0);
  const cookie = (await context.cookies()).find(cookie => cookie.name === 'wordsquad_age_session');
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.expires).toBe(-1);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => /age|birth/i.test(key)))).toBe(false);
});

test('direct game links cannot reveal game state before screening', async ({ page, context }) => {
  await page.goto('/game');
  await expect(page.locator('#ageInput')).toBeVisible();
  expect((await context.request.get('/state')).status()).toBe(403);
  expect((await context.request.get('/chat')).status()).toBe(403);
  await answerAge(page, 13);
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.locator('#board .tile')).toHaveCount(30);
});
