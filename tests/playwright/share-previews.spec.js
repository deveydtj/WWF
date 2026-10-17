const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const path = require('node:path');

test('static invitations route people without sending fragments to servers', async ({ page }) => {
  const requests = [];
  await page.route('http://wordsquad.test/**', route => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    if (url.pathname === '/invite.html' || url.pathname === '/static/js/shareInvite.js') {
      return route.fulfill({
        body: readFileSync(path.join(__dirname, '../../frontend', url.pathname)),
        contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html',
      });
    }
    return route.fulfill({ body: '<title>WordSquad destination</title>', contentType: 'text/html' });
  });
  const invitation = 'ABC123.' + 'x'.repeat(43);
  for (const [fragment, destination] of [
    ['lobby/ABC123', '/#lobby/ABC123'],
    [`private/${invitation}`, `/join#${invitation}`],
    ['lobby/invalid', '/'],
    ['private/invalid', '/'],
    ['//evil.example', '/'],
  ]) {
    await page.goto('http://wordsquad.test/invite.html#' + fragment);
    await expect(page).toHaveURL('http://wordsquad.test' + destination);
  }
  expect(requests.every(url => !url.includes('#') && !url.includes(invitation))).toBe(true);
});
