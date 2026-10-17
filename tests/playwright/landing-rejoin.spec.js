const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../frontend');

async function serveLanding(page, lobbyState) {
  await page.route('http://wordsquad.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/age-status') return route.fulfill({ json: { eligibility: 'eligible' } });
    if (pathname === '/lobbies/network') return route.fulfill({ json: { lobbies: [] } });
    if (pathname === '/wake') return route.fulfill({ status: 204 });
    if (pathname.startsWith('/lobby/') && pathname.endsWith('/state')) return lobbyState(route);
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
    const contentType = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)];
    if (!contentType || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType, body: fs.readFileSync(file) });
  });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('lastLobby', 'OLD123');
      sessionStorage.setItem('seeded', '1');
    }
  });
}

test('Re-join is hidden and forgotten when the saved lobby no longer exists', async ({ page }) => {
  await serveLanding(page, route => route.fulfill({ status: 404, json: { status: 'error', msg: 'Room unavailable' } }));
  await page.goto('http://wordsquad.test/');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lastLobby'))).toBeNull();
  await expect(page.locator('#rejoinChip')).toBeHidden();
});

test('Re-join shows for a saved lobby that is still live', async ({ page }) => {
  await serveLanding(page, route => route.fulfill({ json: { status: 'ok' } }));
  await page.goto('http://wordsquad.test/');
  await expect(page.locator('#rejoinChip')).toBeVisible();
});

test('Re-join waits for a sleeping server, then checks the lobby again', async ({ page }) => {
  let awake = false;
  await page.clock.install();
  await serveLanding(page, route => awake
    ? route.fulfill({ status: 404, json: { status: 'error' } })
    : route.fulfill({ status: 503, contentType: 'text/html', body: '<p>waking</p>' }));
  await page.goto('http://wordsquad.test/');
  await expect(page.locator('#rejoinChip')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('lastLobby'))).toBe('OLD123');
  awake = true;
  await page.clock.fastForward(10000);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lastLobby'))).toBeNull();
  await expect(page.locator('#rejoinChip')).toBeHidden();
});
