const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../frontend');

for (const screen of ['index.html#lobby/ACT001', 'game.html']) {
  for (const dark of [true, false]) {
    test(`${screen} keeps the refresh canvas ${dark ? 'dark' : 'light'} while stylesheets load`, async ({ page }) => {
      await page.addInitScript(dark => localStorage.setItem('darkMode', String(dark)), dark);
      let releaseStyles;
      let stylesheetRequested;
      let stylesReady;
      await page.route('http://wordsquad.test/**', async route => {
        const file = path.join(root, new URL(route.request().url()).pathname);
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

for (const screen of ['index.html', 'game.html']) {
  for (const preference of [true, false, 'unavailable']) {
    const dark = preference === true;
    const theme = preference === 'unavailable' ? 'fallback light' : `saved ${dark ? 'dark' : 'light'}`;
    test(`${screen} paints the ${theme} theme before modules initialize, including on refresh`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(preference => {
        if (preference === 'unavailable') {
          Object.defineProperty(window, 'localStorage', {
            get() { throw new DOMException('Storage is blocked', 'SecurityError'); },
          });
        } else {
          localStorage.setItem('darkMode', String(preference));
        }
      }, preference);
      await page.route('http://wordsquad.test/**', route => {
        // A slow module download must never leave the initial page in the wrong theme.
        if (route.request().resourceType() === 'script') {
          return route.fulfill({ contentType: 'text/javascript', body: '' });
        }
        const file = path.join(root, new URL(route.request().url()).pathname);
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
