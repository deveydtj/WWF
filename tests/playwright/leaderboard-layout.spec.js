const { test, expect } = require('./fixtures/deterministic-lobby');

test('header player badges leave room for their glow and remain reachable', async ({ page, deterministicLobby }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await deterministicLobby.openActive();

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [1, 5]) {
      await page.evaluate(async (playerCount) => {
        const { updateLeaderboard } = await import('/static/js/leaderboardManager.js');
        updateLeaderboard(Array.from({ length: playerCount }, (_, index) => ({
          emoji: ['🐶', '🦊', '🐼', '🐸', '🦉'][index],
          score: 18 - index,
          player_id: `player-${index}`,
        })));
      }, count);
      for (const dark of [false, true]) {
        await page.evaluate((enabled) => document.body.classList.toggle('dark-mode', enabled), dark);
        const bounds = await page.locator('#leaderboard').evaluate((strip) => {
          strip.style.scrollBehavior = 'auto';
          strip.scrollLeft = 0;
          const container = strip.getBoundingClientRect();
          const first = strip.firstElementChild.getBoundingClientRect();
          strip.scrollLeft = strip.scrollWidth;
          const last = strip.lastElementChild.getBoundingClientRect();
          const header = document.getElementById('lobbyHeader').getBoundingClientRect();
          return {
            top: first.top - container.top,
            bottom: container.bottom - first.bottom,
            left: first.left - container.left,
            right: container.right - last.right,
            headerTop: container.top - header.top,
            headerBottom: header.bottom - container.bottom,
          };
        });
        for (const edge of ['top', 'bottom', 'left', 'right']) {
          expect(bounds[edge], `${width}px, ${count} players, dark=${dark}: ${edge} glow space`).toBeGreaterThanOrEqual(6);
        }
        expect(bounds.headerTop).toBeGreaterThanOrEqual(0);
        expect(bounds.headerBottom).toBeGreaterThanOrEqual(0);
      }
    }
  }
});
