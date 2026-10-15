const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../frontend');

test.beforeEach(async ({ page }) => {
  await page.route('http://wordsquad.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/lobbies/network') return route.fulfill({ json: { lobbies: [] } });
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
    const contentType = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)];
    if (!contentType || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType, body: fs.readFileSync(file) });
  });
});

test('tiles wait for loading and fonts before flipping, including on refresh', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    Object.defineProperty(document.fonts, 'ready', {
      value: new Promise(resolve => { window.releaseTileFonts = resolve; }),
    });
    window.tileStarts = [];
    window.tileEnds = [];
    document.addEventListener('animationstart', event => {
      if (event.animationName === 'squad-tile-flip') {
        window.tileStarts.push({ letter: event.target.textContent, ready: document.readyState });
      }
    });
    document.addEventListener('animationend', event => {
      if (event.animationName === 'squad-tile-flip') window.tileEnds.push(event.target.textContent);
    });
  });

  for (let load = 0; load < 2; load++) {
    let releaseModule;
    const moduleReady = new Promise(resolve => { releaseModule = resolve; });
    await page.route('http://wordsquad.test/landing.js', async route => {
      await moduleReady;
      await route.fallback();
    });
    try {
      if (load) await page.reload({ waitUntil: 'commit' });
      else await page.goto('http://wordsquad.test/', { waitUntil: 'commit' });
      const tiles = page.locator('.play-tiles span');
      await expect(tiles).toHaveCount(5);
      expect(await tiles.evaluateAll(elements => elements.flatMap(el => el.getAnimations()).length)).toBe(0);
      releaseModule();
      await page.waitForLoadState('load');
      expect(await tiles.evaluateAll(elements => elements.flatMap(el => el.getAnimations()).length)).toBe(0);
      await page.evaluate(() => window.releaseTileFonts());
      await expect.poll(() => page.evaluate(() => window.tileEnds.length)).toBe(5);
      expect(await page.evaluate(() => window.tileStarts)).toEqual(
        [...'SQUAD'].map(letter => ({ letter, ready: 'complete' }))
      );
      expect(await tiles.evaluateAll(elements => elements.every(el => {
        const style = getComputedStyle(el);
        return style.opacity === '1' && style.transform === 'none' && style.willChange === 'auto';
      }))).toBe(true);
    } finally {
      releaseModule();
      await page.unroute('http://wordsquad.test/landing.js');
    }
  }
});

test('A rotates continuously without reversing before settling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('http://wordsquad.test/');
  await expect(page.locator('#landingView')).toHaveClass(/tiles-ready/);
  const angles = await page.locator('.play-tiles span:nth-child(4)').evaluate(tile => {
    const animation = tile.getAnimations()[0];
    animation.pause();
    const { delay, duration } = animation.effect.getTiming();
    return Array.from({ length: 40 }, (_, index) => {
      animation.currentTime = delay + duration * index / 40;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(tile).transform);
      const angle = Math.atan2(matrix.m23, matrix.m22) * 180 / Math.PI;
      // Safari can round the initial -180-degree matrix to positive 180.
      return angle > 179.9 ? angle - 360 : angle;
    });
  });
  const steps = angles.slice(1).map((angle, index) => angle - angles[index]);
  expect(Math.min(...steps)).toBeGreaterThanOrEqual(-0.05);
  expect(Math.max(...angles)).toBeLessThanOrEqual(0.05);
});

test('reduced motion shows static tiles immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://wordsquad.test/');
  const tiles = page.locator('.play-tiles span');
  expect(await tiles.evaluateAll(elements => elements.every(el => {
    const style = getComputedStyle(el);
    return !el.getAnimations().length && style.opacity === '1' && style.transform === 'none';
  }))).toBe(true);
});

for (const viewport of [{ width: 1000, height: 650 }, { width: 390, height: 700 }]) {
test(`glows precede tiles and funding waits for visibility, with themed Local Lobbies at ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    window.animationOrder = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      const name = this.closest('section')?.id + ':' + (this.getAttribute('class') || '');
      window.animationOrder.push({ name, phase: 'start' });
      animation.finished.then(() => window.animationOrder.push({ name, phase: 'end' }));
      return animation;
    };
    document.addEventListener('animationstart', event => {
      if (event.animationName === 'squad-tile-flip') window.animationOrder.push({ name: 'tile', phase: 'start' });
    });
    document.addEventListener('animationend', event => {
      if (event.animationName === 'squad-tile-flip') window.animationOrder.push({ name: 'tile', phase: 'end' });
    });
  });
  await page.goto('http://wordsquad.test/');
  await page.evaluate(async () => {
    const landing = await import('/landing.js');
    landing.updateDonationSection({ goal: 100, raised: 65 });
    landing.displayNetworkLobbies([{ id: 'LAN123', players: 2, your_emoji: '🐶' }]);
  });
  await expect.poll(() => page.evaluate(() => window.animationOrder.filter(e => e.name === 'tile' && e.phase === 'end').length)).toBe(5);
  let events = await page.evaluate(() => window.animationOrder);
  expect(events.findIndex(e => e.name === 'heroCard:' && e.phase === 'end')).toBeLessThan(events.findIndex(e => e.name === 'tile'));
  expect(events.some(e => e.name.startsWith('donationSection:'))).toBe(false);
  await page.locator('#networkLobbies').evaluate(card => card.scrollIntoView({ block: 'center' }));
  await expect.poll(() => page.evaluate(() => window.animationOrder.filter(e => e.name === 'networkLobbies:' && e.phase === 'end').length)).toBe(1);
  events = await page.evaluate(() => window.animationOrder);
  expect(events.findLastIndex(e => e.name === 'tile' && e.phase === 'end')).toBeLessThan(events.findIndex(e => e.name === 'networkLobbies:'));
  await page.evaluate(() => {
    const card = document.getElementById('donationSection');
    window.scrollTo(0, card.offsetTop - 450);
  });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.animationOrder.some(e => e.name.startsWith('donationSection:')))).toBe(false);
  await page.locator('#donationSection').evaluate(card => card.scrollIntoView({ block: 'center' }));
  await expect.poll(() => page.evaluate(() => window.animationOrder.filter(e => e.name.includes('donation-ring') && e.phase === 'end').length)).toBe(2);
  events = await page.evaluate(() => window.animationOrder);
  expect(events.findIndex(e => e.name === 'donationSection:' && e.phase === 'end')).toBeLessThan(events.findIndex(e => e.name.includes('donation-ring')));
  expect(await page.locator('.donation-ring').evaluate(el => getComputedStyle(el).strokeDasharray.split(',').map(parseFloat))).toEqual([65, 100]);
  await expect(page.locator('#networkLobbies')).toHaveClass(/squad-card/);
  await expect(page.getByRole('button', { name: 'Join lobby LAN123' })).toHaveClass(/play-secondary/);
  await page.evaluate(async () => (await import('/landing.js')).displayNetworkLobbies([]));
  await expect(page.locator('#networkLobbies')).toBeVisible();
  await expect(page.locator('#networkLobbyStatus')).toContainText('No local lobbies yet');
});

}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 700 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(`Local Lobbies glows once only with its whole frame visible at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      window.localGlows = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        if (this.closest('section')?.id === 'networkLobbies') {
          const rect = this.closest('section').getBoundingClientRect();
          const viewport = window.visualViewport;
          window.localGlows.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
            viewTop: viewport.offsetTop, viewLeft: viewport.offsetLeft, height: viewport.height, width: viewport.width });
        }
        return animate.apply(this, args);
      };
    });
    await page.goto('http://wordsquad.test/');
    await page.evaluate(async () => (await import('/landing.js')).displayNetworkLobbies(
      Array.from({ length: 12 }, (_, index) => ({ id: `LOC${String(index).padStart(3, '0')}`, players: 1 }))));
    await page.locator('#heroCard .play-copy').evaluate(copy => copy.scrollIntoView({ block: 'center' }));
    await expect(page.locator('#landingView')).not.toHaveClass(/tiles-(preparing|ready)/);
    const card = page.locator('#networkLobbies');
    await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 80));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.localGlows.length)).toBe(0);
    await card.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await expect.poll(() => page.evaluate(() => window.localGlows.length)).toBe(1);
    const glow = await page.evaluate(() => window.localGlows[0]);
    expect(glow.top).toBeGreaterThanOrEqual(glow.viewTop - 1);
    expect(glow.bottom).toBeLessThanOrEqual(glow.viewTop + glow.height + 1);
    expect(glow.left).toBeGreaterThanOrEqual(glow.viewLeft - 1);
    expect(glow.right).toBeLessThanOrEqual(glow.viewLeft + glow.width + 1);
    await expect(card).not.toHaveClass(/animation-pending/);
    expect(await card.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await card.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.getByRole('button', { name: 'Join lobby LOC011' })).toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));
    await card.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.localGlows.length)).toBe(1);
  });
}
