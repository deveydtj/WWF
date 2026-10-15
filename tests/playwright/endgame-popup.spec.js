const { test, expect } = require('./fixtures/deterministic-lobby');

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  for (const won of [true, false]) {
    test(`${won ? 'winning' : 'game over'} message stays fully onscreen during its animation at ${viewport.width}px`, async ({ page, deterministicLobby }, testInfo) => {
      await page.setViewportSize(viewport);
      await deterministicLobby.openActive();
      const state = {
        ...deterministicLobby.states.completed,
        winner_emoji: won ? '🐶' : null,
      };
      await page.route('**/lobby/ACT001/guess', route => route.fulfill({
        json: { status: 'ok', state, won, over: true, pointsDelta: won ? 9 : 0 },
      }));
      await page.keyboard.type('tar'); // Existing green letters complete STARE.
      await page.locator('.key[data-key="Enter"]').click();
      const popup = page.locator('#messagePopup');
      await expect(popup).toHaveText(`${won ? 'You got it!' : 'Game Over!'} The word was STARE`);
      const samples = await popup.evaluate(element => {
        const animation = element.getAnimations()[0];
        animation.pause();
        return [0, 200, 1000, 1800, 1999].map(time => {
          animation.currentTime = time;
          const { top, left, right, bottom } = element.getBoundingClientRect();
          return { time, top, left, right, bottom, width: innerWidth, height: innerHeight };
        });
      });
      for (const bounds of samples) {
        expect(bounds.top, JSON.stringify(bounds)).toBeGreaterThanOrEqual(0);
        expect(bounds.left, JSON.stringify(bounds)).toBeGreaterThanOrEqual(0);
        expect(bounds.right, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.width);
        expect(bounds.bottom, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.height);
      }
      await popup.evaluate(element => { element.getAnimations()[0].currentTime = 1000; });
      await page.screenshot({ path: testInfo.outputPath('endgame-popup.png') });
      await popup.evaluate(async element => {
        const animation = element.getAnimations()[0];
        animation.play();
        await animation.finished;
      });
      await expect(popup).toBeHidden();
    });
  }
}
