const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../frontend');

// Create/Join while the server sleeps: the landing page shows the wake panel
// with a live estimate, then carries on by itself once the server is up.
async function serveSleepingLanding(page, server) {
  await page.route('http://wordsquad.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/age-status') return route.fulfill({ json: { eligibility: 'eligible' } });
    if (pathname === '/lobbies/network') return route.fulfill({ json: { lobbies: [] } });
    if (pathname === '/wake') {
      server.wakes += 1;
      return route.fulfill({ status: 202, json: { state: 'pending', elapsed: 0 } });
    }
    if (pathname === '/health' || pathname === '/lobby' || pathname.startsWith('/lobby/')) {
      if (!server.awake) return route.fulfill({ status: 503, contentType: 'text/html', body: '<p>waking</p>' });
      if (pathname === '/health') return route.fulfill({ json: { status: 'ok' } });
      if (pathname === '/lobby') {
        server.lobbyPosts += 1;
        return route.fulfill({ json: { id: 'ABC123', host_token: 'token' } });
      }
      return route.fulfill({ contentType: 'text/html', body: '<p>lobby</p>' });
    }
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
    const contentType = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)];
    if (!contentType || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType, body: fs.readFileSync(file) });
  });
  await page.addInitScript(() => localStorage.setItem('myEmoji', '🐶'));
}

test('Create while the server sleeps shows the wake panel, counts down, then opens the lobby', async ({ page }) => {
  const server = { awake: false, wakes: 0, lobbyPosts: 0 };
  await page.clock.install();
  await serveSleepingLanding(page, server);
  await page.goto('http://wordsquad.test/');
  await page.locator('#createBtn').click();

  const panel = page.locator('#wakePanel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#createBtn')).toBeHidden();
  await expect(page.locator('#joinForm')).toBeHidden();
  await expect(page.locator('#wakeStatus')).toContainText('Your lobby opens as soon as it\'s ready.');
  await expect(page.locator('#wakeEta')).toHaveText('1:00');

  await page.clock.fastForward(20_000);
  await expect(page.locator('#wakeEta')).toHaveText('0:40');
  await expect(page.locator('#wakeProgress')).toHaveAttribute('aria-valuenow', '30');

  server.awake = true;
  await page.clock.fastForward(5_000);
  await expect(page).toHaveURL(/#lobby\/ABC123$/);
  expect(server.lobbyPosts).toBe(1);
  expect(server.wakes).toBeLessThanOrEqual(3);
});

test('Cancel puts Create and Join back', async ({ page }) => {
  const server = { awake: false, wakes: 0, lobbyPosts: 0 };
  await serveSleepingLanding(page, server);
  await page.goto('http://wordsquad.test/');
  await page.locator('#joinCode').fill('XYZ789');
  await page.locator('#joinBtn').click();
  await expect(page.locator('#wakeStatus')).toContainText('You\'ll join XYZ789 as soon as it\'s ready.');
  await page.locator('#wakeCancel').click();
  await expect(page.locator('#wakePanel')).toBeHidden();
  await expect(page.locator('#createBtn')).toBeVisible();
  await expect(page.locator('#joinForm')).toBeVisible();
  expect(server.lobbyPosts).toBe(0);
});
