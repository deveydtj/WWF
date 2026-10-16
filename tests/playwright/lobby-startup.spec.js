const { test, expect } = require('./fixtures/deterministic-lobby');
const fs = require('fs');
const path = require('path');
const { PNG } = require('playwright-core/lib/utilsBundle');

const frontend = path.resolve(__dirname, '../../frontend');

for (const stage of ['static/js/gameBootstrap.js', 'age-status', 'lobby/ACT001/state*']) {
  test(`refresh waits for ${stage} before painting the game`, async ({ page, deterministicLobby }) => {
    await page.addInitScript(() => localStorage.setItem('darkMode', 'true'));
    let release;
    let requested;
    let pending;
    await page.route(`**/${stage}`, async route => {
      requested();
      await pending;
      await route.fallback();
    });
    for (let load = 0; load < 2; load++) {
      pending = new Promise(resolve => { release = resolve; });
      const downloading = new Promise(resolve => { requested = resolve; });
      try {
        if (load) await page.reload({ waitUntil: 'commit' });
        else await page.goto('http://wordsquad.test/lobby/ACT001', { waitUntil: 'commit' });
        await downloading;
        await expect(page.locator('#keyboard')).toBeAttached();
        await expect(page.locator('#keyboard')).toBeHidden();
        await expect(page.locator('#hostControls')).toBeHidden();
        // Startup must preserve measurable geometry for responsive sizing.
        expect((await page.locator('#appContainer').boundingBox()).width).toBeGreaterThan(0);
      } finally {
        release();
      }
      await expect(page.locator('#board .tile')).toHaveCount(30);
      await expect(page.locator('#board')).toBeVisible();
      await expect(page.locator('#hostControls')).toBeVisible();
      expect(await page.locator('#appContainer').evaluate(app => app.inert)).toBe(false);
      expect(await page.locator('body').getAttribute('data-density')).toBeTruthy();
    }
  });
}

test('startup still shows a connection error when the initial state request fails', async ({ page, deterministicLobby }) => {
  await page.route('**/lobby/ACT001/state*', route => route.fulfill({ status: 503, json: { msg: 'Unavailable' } }));
  await page.goto('http://wordsquad.test/lobby/ACT001');
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#message:visible, #messagePopup:visible').filter({ hasText: 'Connection lost' })).toBeVisible();
});

test('the eligibility dialog stays usable while the game is hidden', async ({ page, deterministicLobby }) => {
  await page.route('**/age-status', route => route.fulfill({ json: { eligibility: 'unknown' } }));
  await page.goto('http://wordsquad.test/lobby/ACT001');
  await expect(page.locator('#keyboard')).toBeHidden();
  await expect(page.locator('#ageCheckDialog')).toBeVisible();
  await page.locator('#ageInput').fill('30');
  await expect(page.locator('#ageInput')).toHaveValue('30');
});

async function serveLanding(page) {
  for (const file of ['index.html', 'landing.css', 'landing.js']) {
    await page.route(`http://wordsquad.test/${file}`, route => route.fulfill({
      contentType: { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)],
      body: fs.readFileSync(path.join(frontend, file)),
    }));
  }
  await page.route('**/lobbies/network', route => route.fulfill({ json: { lobbies: [] } }));
}

for (const dark of [true, false]) {
  test(`${dark ? 'dark' : 'light'} lobby keeps its canvas while the iframe downloads, including on refresh`, async ({ page, deterministicLobby }, testInfo) => {
    await serveLanding(page);
    await page.addInitScript(dark => localStorage.setItem('darkMode', String(dark)), dark);
    let release;
    let requested;
    let pending;
    await page.route('**/lobby/ACT001', async route => {
      requested();
      await pending;
      await route.fallback();
    });
    // Fonts.ready waits for frame load; deliberately capture before that load.
    const fontWait = process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
    process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
    try {
      for (let load = 0; load < 2; load++) {
        pending = new Promise(resolve => { release = resolve; });
        const downloading = new Promise(resolve => { requested = resolve; });
        if (load) await page.reload({ waitUntil: 'domcontentloaded' });
        else await page.goto('http://wordsquad.test/index.html#lobby/ACT001', { waitUntil: 'domcontentloaded' });
        await downloading;
        await expect(page.locator('#lobbyView iframe')).toHaveCount(1);
        // A pending frame stays laid out at full size, so the game boots against
        // the real viewport instead of a display:none frame (off-center in Safari).
        expect(await page.locator('#lobbyView iframe').evaluate(frame => Math.round(frame.getBoundingClientRect().width)))
          .toBe(page.viewportSize().width);
        const shot = PNG.sync.read(await page.screenshot({ path: testInfo.outputPath(`pending-lobby-${load}.png`), timeout: 5000 }));
        const center = ((Math.floor(shot.height / 2) * shot.width) + Math.floor(shot.width / 2)) * 4;
        expect(Array.from(shot.data.subarray(center, center + 3))).toEqual(dark ? [44, 48, 58] : [224, 229, 236]);
        release();
        await expect(page.locator('#lobbyView iframe')).toBeVisible();
        await expect(page.frameLocator('#lobbyView iframe').locator('#board .tile')).toHaveCount(30);
      }
    } finally {
      release?.();
      if (fontWait === undefined) delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
      else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = fontWait;
    }
  });
}

for (const hash of ['', '#lobby/ACT001', '#lobby/invalid']) {
  test(`initial view is correct before modules load: ${hash || 'landing'}`, async ({ page, deterministicLobby }) => {
    await serveLanding(page);
    // Keep initialization unavailable to expose any landing page flash.
    await page.route('**/landing.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto(`http://wordsquad.test/index.html${hash}`);
    for (let load = 0; load < 2; load++) {
      if (load) await page.reload();
      if (hash === '#lobby/ACT001') await expect(page.locator('#landingView')).toBeHidden();
      else await expect(page.locator('#landingView')).toBeVisible();
    }
  });
}

test('refresh restores the game and leaving restores the landing page', async ({ page, deterministicLobby }) => {
  await serveLanding(page);
  await page.goto('http://wordsquad.test/index.html#lobby/ACT001');
  await expect(page.frameLocator('#lobbyView iframe').locator('#board .tile')).toHaveCount(30);
  await page.reload();
  await expect(page.locator('#landingView')).toBeHidden();
  await expect(page.frameLocator('#lobbyView iframe').locator('#board .tile')).toHaveCount(30);
  await page.evaluate(() => { window.location.hash = ''; });
  await expect(page.locator('#landingView')).toBeVisible();
  await expect(page.locator('#lobbyView')).toBeHidden();
});

test('embedded desktop lobby fills the viewport after resizing', async ({ page, deterministicLobby }) => {
  await serveLanding(page);
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto('http://wordsquad.test/index.html#lobby/ACT001');
  await expect(page.frameLocator('#lobbyView iframe').locator('#board .tile')).toHaveCount(30);
  for (const viewport of [{ width: 1960, height: 1150 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.locator('#lobbyView iframe').evaluate(frame => {
      const rect = frame.getBoundingClientRect();
      const body = frame.contentDocument.body.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: Math.round(rect.width), height: Math.round(rect.height),
        bodyWidth: Math.round(body.width), bodyHeight: Math.round(body.height),
        scrollHeight: document.documentElement.scrollHeight };
    })).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height,
      bodyWidth: viewport.width, bodyHeight: viewport.height, scrollHeight: viewport.height });
  }
});
