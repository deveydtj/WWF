const { test, expect } = require('./fixtures/deterministic-lobby');
const fs = require('fs');
const path = require('path');

test('first lobby visit leaves using the player ID assigned during registration', async ({ page, deterministicLobby }) => {
  // A first-time visitor has picked an emoji on the landing page but has no ID yet.
  await page.addInitScript(() => localStorage.removeItem('playerId'));
  await deterministicLobby.openActive();
  const requests = [];
  await page.route('**/lobby/ACT001/leave', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: 'ok', lobby_removed: true } });
  });
  await page.route('http://wordsquad.test/', route => route.fulfill({ contentType: 'text/html', body: '<title>Landing</title>' }));
  await page.locator('#leaveLobby').click();
  await expect(page).toHaveTitle('Landing');
  expect(requests).toEqual([{ emoji: '🐶', player_id: 'fixture-player' }]);
});

test('a rejected leave request keeps the game and rejoin entry available', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await page.evaluate(() => localStorage.setItem('lastLobby', 'ACT001'));
  await page.route('**/lobby/ACT001/leave', route => route.fulfill({
    status: 503, json: { status: 'error', msg: 'Please retry' },
  }));
  await page.locator('#leaveLobby').click();
  await expect(page.locator('#leaveLobby')).toBeEnabled();
  await expect(page.locator('#board')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lastLobby'))).toBe('ACT001');
});

test('embedded lobby stays visible until the leave request completes', async ({ page, deterministicLobby }) => {
  // Use the real landing page and its hash navigation around the fixture game.
  await page.route('http://wordsquad.test/', route => route.fulfill({
    contentType: 'text/html',
    body: fs.readFileSync(path.resolve(__dirname, '../../frontend/index.html')),
  }));
  for (const file of ['landing.js', 'landing.css']) {
    await page.route(`http://wordsquad.test/${file}`, route => route.fulfill({
      contentType: file.endsWith('.js') ? 'text/javascript' : 'text/css',
      body: fs.readFileSync(path.resolve(__dirname, '../../frontend', file)),
    }));
  }
  await page.route('**/lobbies/network', route => route.fulfill({ json: { lobbies: [] } }));
  await page.route('http://wordsquad.test/lobby', route => route.fulfill({ json: { id: 'ACT001' } }));
  await page.goto('http://wordsquad.test/');
  await page.locator('#createBtn').click();
  const game = page.frameLocator('#lobbyView iframe');
  await expect(game.locator('#board .tile')).toHaveCount(30);
  let finishLeave;
  const pendingLeave = new Promise(resolve => { finishLeave = resolve; });
  const requests = [];
  await page.route('**/lobby/ACT001/leave', async route => {
    requests.push(route.request().postDataJSON());
    await pendingLeave;
    await route.fulfill({ json: { status: 'ok', lobby_removed: true } });
  });
  try {
    await game.locator('#leaveLobby').click();
    await expect.poll(() => requests.length).toBe(1);
    await expect(page.locator('#lobbyView')).toBeVisible();
    await expect(page.locator('#landingView')).toBeHidden();
  } finally {
    finishLeave();
  }
  await expect(page.locator('#landingView')).toBeVisible();
  expect(requests).toEqual([{ emoji: '🐶', player_id: 'fixture-player' }]);
});
