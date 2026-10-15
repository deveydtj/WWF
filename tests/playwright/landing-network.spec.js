const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../frontend');

test('LAN discovery stays above donations, checks eligibility, and refreshes new games', async ({ page }) => {
  let eligible = false;
  let lobbies = [];
  let discoveries = 0;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.route('http://wordsquad.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/age-status') return route.fulfill({ json: { eligibility: eligible ? 'eligible' : 'unknown' } });
    if (pathname === '/age-check') {
      eligible = true;
      return route.fulfill({ json: { eligibility: 'eligible' } });
    }
    if (pathname === '/lobbies/network') {
      discoveries++;
      return route.fulfill({ json: { lobbies } });
    }
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
    const contentType = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)];
    if (!contentType || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType, body: fs.readFileSync(file) });
  });
  await page.goto('http://wordsquad.test/');
  await expect(page.locator('#networkLobbies')).toBeVisible();
  expect(await page.locator('#networkLobbies').evaluate(el => Boolean(el.compareDocumentPosition(document.getElementById('donationSection')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  expect(discoveries).toBe(0);
  await page.getByRole('button', { name: 'Find local lobbies' }).click();
  await expect(page.locator('#ageCheckDialog')).toBeVisible();
  await page.locator('#ageInput').fill('18');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('#networkLobbyStatus')).toContainText('No local lobbies yet');
  lobbies = [{ id: 'LAN123', players: 1 }];
  await page.clock.fastForward(10000);
  await expect(page.getByRole('button', { name: 'Join lobby LAN123' })).toBeVisible();
  await expect(page.locator('.player-count')).toHaveText('1 player');
  lobbies = [];
  await page.getByRole('button', { name: 'Find local lobbies' }).click();
  await expect(page.locator('#networkLobbyList')).toBeEmpty();
  await expect(page.locator('#networkLobbyStatus')).toContainText('No local lobbies yet');
});
