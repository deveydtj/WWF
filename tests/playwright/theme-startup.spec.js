const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../frontend');

for (const screen of ['index.html#lobby/ACT001', 'game.html', 'join.html']) {
  for (const preference of [true, false, 'device dark', 'device light']) {
    const dark = preference === true || preference === 'device dark';
    const theme = typeof preference === 'boolean' ? `saved ${dark ? 'dark' : 'light'}` : preference;
    test(`${screen} keeps the ${theme} refresh canvas while stylesheets load`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: preference === true || preference === 'device light' ? 'light' : 'dark' });
      if (typeof preference === 'boolean') {
        await page.addInitScript(dark => localStorage.setItem('darkMode', String(dark)), dark);
      }
      let releaseStyles;
      let stylesheetRequested;
      let stylesReady;
      await page.route('http://wordsquad.test/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        const file = path.join(root, pathname === '/join' ? 'join.html' : pathname);
        const extension = path.extname(file);
        if (extension === '.css') {
          stylesheetRequested();
          await stylesReady;
        }
        const contentType = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[extension];
        if (!contentType || !fs.existsSync(file)) return route.fulfill({ status: 404 });
        return route.fulfill({ contentType, body: extension === '.js' ? '' : fs.readFileSync(file) });
      });
      for (let load = 0; load < 2; load++) {
        stylesReady = new Promise(resolve => { releaseStyles = resolve; });
        const requested = new Promise(resolve => { stylesheetRequested = resolve; });
        try {
          if (load) await page.reload({ waitUntil: 'commit' });
          else await page.goto(`http://wordsquad.test/${screen}`, { waitUntil: 'commit' });
          await requested;
          const canvas = await page.evaluate(() => {
            const style = getComputedStyle(document.documentElement);
            return { background: style.backgroundColor, scheme: style.colorScheme };
          });
          expect(canvas).toEqual({
            background: dark ? 'rgb(44, 48, 58)' : 'rgb(224, 229, 236)',
            scheme: dark ? 'dark' : 'light',
          });
        } finally {
          releaseStyles();
        }
        await page.waitForLoadState('load');
      }
    });
  }
}

for (const screen of ['index.html', 'game.html', 'join.html']) {
  for (const colorScheme of ['dark', 'light']) {
    for (const preference of [true, false, null, 'unavailable']) {
      const dark = typeof preference === 'boolean' ? preference : colorScheme === 'dark';
      const theme = typeof preference === 'boolean' ? `saved ${preference ? 'dark' : 'light'}` : `device ${colorScheme} (${preference})`;
      test(`${screen} paints the ${theme} theme on a ${colorScheme} device before modules initialize, including on refresh`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(preference => {
          if (preference === 'unavailable') {
            Object.defineProperty(window, 'localStorage', {
              get() { throw new DOMException('Storage is blocked', 'SecurityError'); },
            });
          } else if (preference !== null) {
            localStorage.setItem('darkMode', String(preference));
          }
        }, preference);
        await page.route('http://wordsquad.test/**', route => {
          // A slow module download must never leave the initial page in the wrong theme.
          if (route.request().resourceType() === 'script') {
            return route.fulfill({ contentType: 'text/javascript', body: '' });
          }
          const pathname = new URL(route.request().url()).pathname;
          const file = path.join(root, pathname === '/join' ? 'join.html' : pathname);
          const contentType = { '.html': 'text/html', '.css': 'text/css' }[path.extname(file)];
          if (!contentType || !fs.existsSync(file)) return route.fulfill({ status: 404 });
          return route.fulfill({ contentType, body: fs.readFileSync(file) });
        });
        await page.goto(`http://wordsquad.test/${screen}`);
        for (let load = 0; load < 2; load++) {
          if (load) await page.reload();
          const firstFrame = await page.evaluate(() => new Promise(resolve => {
            requestAnimationFrame(() => resolve({
              dark: document.body.classList.contains('dark-mode'),
              background: getComputedStyle(document.body).backgroundColor,
              animations: document.body.getAnimations().length,
            }));
          }));
          expect(firstFrame).toEqual({
            dark,
            background: dark ? 'rgb(44, 48, 58)' : 'rgb(224, 229, 236)',
            animations: 0,
          });
          expect(errors).toEqual([]);
        }
      });
    }
  }
}
