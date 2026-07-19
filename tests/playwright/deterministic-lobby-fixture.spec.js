const {
  test,
  expect,
  LOBBY_CODES,
} = require('./fixtures/deterministic-lobby');

test.describe('deterministic lobby fixture', () => {
  test('loads a fully populated active game', async ({ page, deterministicLobby }) => {
    await deterministicLobby.openActive();

    await expect(page).toHaveURL(new RegExp(`/lobby/${LOBBY_CODES.active}$`));
    await expect(page.locator('#board .tile')).toHaveCount(30);
    await expect(page.locator('#board .tile').nth(0)).toHaveText('S');
    await expect(page.locator('#board .tile').nth(1)).toHaveText('L');
    await expect(page.locator('#board .tile').nth(2)).toHaveText('A');
    await expect(page.locator('#board .tile').nth(3)).toHaveText('T');
    await expect(page.locator('#board .tile').nth(4)).toHaveText('E');
    await expect(page.locator('#historyList .history-item')).toHaveCount(5);
    await expect(page.locator('#definitionText')).toContainText('CAPER');
    await expect(page.locator('#chatMessages .chat-entry')).toHaveCount(4);
    await expect(page.locator('#playerList .player-roster-row')).toHaveCount(5);
    await expect(page.locator('#guessInput')).toBeEnabled();
  });

  test('loads a fully populated completed game', async ({ page, deterministicLobby }) => {
    await deterministicLobby.openCompleted();

    await expect(page).toHaveURL(new RegExp(`/lobby/${LOBBY_CODES.completed}$`));
    await expect(page.locator('#board .tile')).toHaveCount(30);
    await expect(page.locator('#historyList .history-item')).toHaveCount(5);
    await expect(page.locator('#definitionText')).toContainText('STARE');
    await expect(page.locator('#definitionText')).toContainText('look steadily or intently');
    await expect(page.locator('#chatMessages .chat-entry')).toHaveCount(4);
    await expect(page.locator('#playerList .player-roster-row')).toHaveCount(5);
    await expect(page.locator('#board .tile').nth(5)).toHaveText('S');
    await expect(page.locator('#board .tile').nth(6)).toHaveText('T');
    await expect(page.locator('#board .tile').nth(7)).toHaveText('A');
    await expect(page.locator('#board .tile').nth(8)).toHaveText('R');
    await expect(page.locator('#board .tile').nth(9)).toHaveText('E');
  });
});
