const { test, expect } = require('./fixtures/deterministic-lobby');

test.use({ hasTouch: false, isMobile: false });

for (const [width, height] of [[900, 900], [1024, 900], [1200, 900], [1440, 900], [1920, 900], [1440, 600], [2560, 1440]]) {
  test(`panels stay beside the centered board at ${width}x${height}`, async ({ page, deterministicLobby }) => {
    await page.setViewportSize({ width, height });
    await deterministicLobby.openActive();

    // Exercise empty rails, either rail alone, both rails, and chat replacing definition.
    for (const panels of [[], ['history'], ['definition'], ['history', 'definition'], ['chat'], ['history', 'chat']]) {
      const state = {
        ...deterministicLobby.states.active,
        guesses: panels.includes('history') ? deterministicLobby.states.active.guesses : [],
        past_games: panels.includes('history') ? deterministicLobby.states.active.past_games : [],
        last_word: panels.includes('definition') ? 'caper' : null,
        last_definition: panels.includes('definition') ? 'A playful leap or skip.' : null,
      };
      deterministicLobby.setState('active', state);
      await page.evaluate(async state => {
        const { default: manager } = await import('/lobby/static/js/gameStateManager.js');
        manager.applyState(state);
      }, state);
      await page.evaluate(async open => {
        const { setOverlayOpen, setManualOverlayState } = await import('/lobby/static/js/overlayState.js');
        for (const panel of ['history', 'definition', 'chat']) {
          setManualOverlayState(panel, open.includes(panel));
          setOverlayOpen(panel, open.includes(panel));
        }
      }, panels);
      if (panels.length) await expect(page.locator(`#${panels.at(-1)}Box`)).toBeVisible();
      // Let the viewport service settle any board measurements after the change.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(
        () => requestAnimationFrame(() => requestAnimationFrame(resolve))
      )));

      const layout = await page.evaluate(() => {
        const rect = id => document.getElementById(id).getBoundingClientRect().toJSON();
        return {
          board: rect('board'), area: rect('boardArea'),
          keyboard: rect('keyboard'),
          capacity: Number(document.body.dataset.panelCapacity),
          history: rect('historyBox'), definition: rect('definitionBox'), chat: rect('chatBox'),
          stamps: [...document.querySelectorAll('.emoji-stamp')].map(el => el.getBoundingClientRect().toJSON()),
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      const context = `${width}px with ${panels.join(', ') || 'no panels'}`;
      expect.soft(Math.abs(layout.board.x + layout.board.width / 2 - width / 2), context).toBeLessThanOrEqual(1);
      expect.soft(layout.scrollWidth, context).toBeLessThanOrEqual(width);
      if (panels.includes('history') && layout.capacity >= 1) {
        expect.soft(layout.history.left, context).toBeGreaterThanOrEqual(0);
        expect.soft(Math.abs(layout.history.top - layout.board.top), context).toBeLessThanOrEqual(1);
        if (layout.keyboard.height) expect.soft(layout.history.bottom, context).toBeLessThanOrEqual(layout.keyboard.top);
        expect.soft(layout.area.left - layout.history.right, context).toBeGreaterThanOrEqual(0);
        expect.soft(layout.area.left - layout.history.right, context).toBeLessThanOrEqual(24);
        for (const stamp of layout.stamps) {
          expect.soft(stamp.left - layout.history.right, context).toBeGreaterThanOrEqual(0);
        }
      }
      for (const panel of ['definition', 'chat']) {
        if (!panels.includes(panel) || layout.capacity < 2) continue;
        expect.soft(Math.abs(layout[panel].top - layout.board.top), context).toBeLessThanOrEqual(1);
        if (layout.keyboard.height) expect.soft(layout[panel].bottom, context).toBeLessThanOrEqual(layout.keyboard.top);
        expect.soft(layout[panel].left - layout.area.right, context).toBeGreaterThanOrEqual(0);
        expect.soft(layout[panel].left - layout.area.right, context).toBeLessThanOrEqual(24);
        expect.soft(layout[panel].right, context).toBeLessThanOrEqual(width);
      }
      if (width === 1440 && height === 900 && panels.length === 2) {
        await page.screenshot({ path: test.info().outputPath(`${panels.join('-')}.png`) });
      }
    }
  });
}
