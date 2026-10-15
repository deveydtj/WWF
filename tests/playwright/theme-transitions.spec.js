const { test, expect } = require('./fixtures/deterministic-lobby');
const fs = require('fs');
const path = require('path');

const surfaces = {
  landing: ['body', '#mainHeader', '#heroCard', '#joinBtn', '.donation-track'],
  game: ['body', '#optionsMenu', '#board .tile', '#keyboard button', '#historyBox'],
};

async function open(page, deterministicLobby, screen) {
  if (screen === 'game') {
    await deterministicLobby.openActive();
    await page.locator('#optionsToggle').click();
    return '#menuDarkMode';
  }
  await page.route('http://wordsquad.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/lobbies/network') return route.fulfill({ json: { lobbies: [] } });
    const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!['index.html', 'landing.js', 'landing.css'].includes(filename)) return route.fallback();
    const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(filename)];
    return route.fulfill({ contentType, body: fs.readFileSync(path.resolve(__dirname, '../../frontend', filename)) });
  });
  await page.goto('http://wordsquad.test/');
  await expect(page.locator('#darkToggle')).toHaveAttribute('aria-label', 'Switch to dark mode');
  return '#darkToggle';
}

for (const screen of ['landing', 'game']) {
  for (const width of [390, 800, 1440]) {
    test(`${screen} theme fades both ways and reverses smoothly at ${width}px`, async ({ page, deterministicLobby }) => {
      await page.setViewportSize({ width, height: 900 });
      const toggle = await open(page, deterministicLobby, screen);
      const frames = await page.evaluate(({ toggle, selectors }) => {
        const sample = () => selectors.map(selector => {
          const style = getComputedStyle(document.querySelector(selector));
          return [style.backgroundColor, style.backgroundImage, style.color, style.boxShadow, style.stroke];
        });
        const button = document.querySelector(toggle);
        button.click();
        const forward = document.body.getAnimations()[0];
        forward.pause();
        forward.currentTime = 0;
        const light = sample();
        forward.currentTime = 150;
        const middle = sample();
        forward.currentTime = 300;
        const dark = sample();
        button.click();
        const backward = document.body.getAnimations()[0];
        backward.pause();
        backward.currentTime = 0;
        const reverseStart = sample();
        backward.currentTime = 150;
        const reverseMiddle = sample();
        button.click();
        const interrupted = document.body.getAnimations()[0];
        interrupted.pause();
        interrupted.currentTime = 0;
        const interruptedStart = sample();
        interrupted.finish();
        return { light, middle, dark, reverseStart, reverseMiddle, interruptedStart };
      }, { toggle, selectors: surfaces[screen] });
      for (let index = 0; index < frames.light.length; index++) {
        expect(frames.middle[index]).not.toEqual(frames.light[index]);
        expect(frames.middle[index]).not.toEqual(frames.dark[index]);
      }
      expect(frames.reverseStart).toEqual(frames.dark);
      expect(frames.interruptedStart).toEqual(frames.reverseMiddle);
      await expect(page.locator('body')).not.toHaveClass(/theme-changing/);
      expect(await page.locator('html').evaluate(html => getComputedStyle(html).colorScheme)).toBe('dark');
      expect(await page.locator('html').evaluate(html => html.style.backgroundColor)).toBe('');
      expect(await page.evaluate(() => localStorage.getItem('darkMode'))).toBe('true');
      await page.reload();
      await expect(page.locator('body')).toHaveClass(/dark-mode/);
      expect(await page.locator('body').evaluate(body => body.getAnimations().length)).toBe(0);
    });
  }

  test(`${screen} respects reduced motion`, async ({ page, deterministicLobby }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const toggle = await open(page, deterministicLobby, screen);
    const result = await page.evaluate(toggle => {
      const before = getComputedStyle(document.body).backgroundColor;
      document.querySelector(toggle).click();
      return {
        before,
        after: getComputedStyle(document.body).backgroundColor,
        animations: document.body.getAnimations({ subtree: true }).filter(animation =>
          animation.effect.getKeyframes().some(frame => 'backgroundColor' in frame || '--bg-color' in frame)
        ).length,
      };
    }, toggle);
    expect(result.after).not.toBe(result.before);
    expect(result.animations).toBe(0);
    await expect(page.locator('body')).not.toHaveClass(/theme-changing/);
  });

  test(`${screen} fades ordinary surfaces without typed color support`, async ({ page, deterministicLobby }) => {
    await page.addInitScript(() => {
      Object.defineProperty(CSS, 'registerProperty', { value: undefined });
    });
    const toggle = await open(page, deterministicLobby, screen);
    const frames = await page.evaluate(toggle => {
      const body = document.body;
      document.querySelector(toggle).click();
      const transition = body.getAnimations().find(animation => animation.transitionProperty === 'background-color');
      transition.pause();
      transition.currentTime = 0;
      const from = getComputedStyle(body).backgroundColor;
      transition.currentTime = 150;
      const middle = getComputedStyle(body).backgroundColor;
      transition.currentTime = 300;
      const to = getComputedStyle(body).backgroundColor;
      transition.finish();
      return { from, middle, to };
    }, toggle);
    expect(frames.middle).not.toBe(frames.from);
    expect(frames.middle).not.toBe(frames.to);
    await expect(page.locator('body')).not.toHaveClass(/theme-changing/);
  });
}
