const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const frontend = path.resolve(__dirname, '../../frontend');

for (const failure of ['unavailable', 'offline', 'waking']) {
  test(`age entry and submission recover after a failed status check: ${failure}`, async ({ page }) => {
    let eligible = false;
    let submissions = 0;
    await page.route('http://wordsquad.test/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/age-status') {
        if (eligible) return route.fulfill({ json: { eligibility: 'eligible' } });
        if (failure === 'offline') return route.abort('failed');
        return route.fulfill({
          status: failure === 'unavailable' ? 503 : 200,
          contentType: 'text/html', body: '<h1>Starting the game server</h1>',
        });
      }
      if (pathname === '/age-check' && route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({ age: 30 });
        // A failed submission must also leave the form usable for another try.
        if (++submissions === 1) {
          if (failure === 'waking') return route.fulfill({
            status: 503, contentType: 'text/html', body: '<h1>Starting the game server</h1>',
          });
          return route.fulfill({ status: 503, json: { msg: 'Please try again.' } });
        }
        eligible = true;
        return route.fulfill({ json: { eligibility: 'eligible' } });
      }
      const file = path.join(frontend, pathname === '/age-check' ? 'age-check.html' : pathname);
      const contentType = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)];
      if (!contentType || !fs.existsSync(file)) return route.fulfill({ status: 404 });
      return route.fulfill({ contentType, body: fs.readFileSync(file) });
    });
    await page.goto('http://wordsquad.test/age-check?next=/game');
    await expect(page.locator('#ageCheckError')).not.toBeEmpty();
    if (failure === 'waking') await expect(page.locator('#ageCheckError'))
      .toHaveText('Could not check eligibility. Please try again.');
    await expect(page.locator('#ageInput')).toBeEditable();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
    await page.locator('#ageInput').fill('30');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('#ageCheckError')).toHaveText(failure === 'waking'
      ? 'The game server is waking up. Try again in about a minute.'
      : 'Please try again.');
    await page.locator('#ageInput').fill('30');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL('http://wordsquad.test/game');
    expect(submissions).toBe(2);
  });
}
