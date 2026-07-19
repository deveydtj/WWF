/**
 * Playwright fixture for initialized WordSquad lobby pages.
 *
 * Import `test` and call `deterministicLobby.openActive()` or
 * `deterministicLobby.openCompleted()`. The fixture serves the production
 * frontend at a six-character lobby URL and intercepts its lobby APIs, so it
 * needs neither a live backend nor persisted game data.
 */
const { test: base, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend');
const FIXTURE_ORIGIN = 'http://wordsquad.test';
const FIXED_LAST_ACTIVE = 2_000_000_000;

const LOBBY_CODES = Object.freeze({
  active: 'ACT001',
  completed: 'END001',
});

const PLAYERS = Object.freeze([
  { emoji: '🐶', score: 18, last_active: FIXED_LAST_ACTIVE, player_id: 'fixture-player' },
  { emoji: '🦊', score: 14, last_active: FIXED_LAST_ACTIVE, player_id: 'fixture-fox' },
  { emoji: '🐼', score: 11, last_active: FIXED_LAST_ACTIVE, player_id: 'fixture-panda' },
  { emoji: '🐸', score: 7, last_active: FIXED_LAST_ACTIVE, player_id: 'fixture-frog' },
  { emoji: '🦉', score: 4, last_active: FIXED_LAST_ACTIVE, player_id: 'fixture-owl' },
]);

const PAST_GAME = Object.freeze([
  {
    guess: 'crane',
    result: ['correct', 'absent', 'present', 'absent', 'correct'],
    emoji: '🦊',
    points: 5,
  },
  {
    guess: 'cider',
    result: ['correct', 'present', 'absent', 'correct', 'absent'],
    emoji: '🐼',
    points: 4,
  },
  {
    guess: 'caper',
    result: ['correct', 'correct', 'correct', 'correct', 'correct'],
    emoji: '🐶',
    points: 8,
  },
]);

const CHAT_MESSAGES = Object.freeze([
  { emoji: '🦊', text: 'Ready for the next word?' },
  { emoji: '🐼', text: 'I am testing the tablet layout.' },
  { emoji: '🐸', text: 'The board has all six rows.' },
  { emoji: '🐶', text: 'Fixture state loaded.' },
]);

const FIXTURE_STATES = Object.freeze({
  active: {
    guesses: [
      {
        guess: 'slate',
        result: ['correct', 'absent', 'present', 'present', 'correct'],
        emoji: '🐶',
        points: 4,
      },
      {
        guess: 'share',
        result: ['correct', 'absent', 'present', 'absent', 'correct'],
        emoji: '🦊',
        points: 2,
      },
    ],
    target_word: null,
    is_over: false,
    leaderboard: PLAYERS,
    active_emojis: PLAYERS.map(({ emoji }) => emoji),
    winner_emoji: null,
    max_rows: 6,
    phase: 'playing',
    past_games: [PAST_GAME],
    definition: null,
    last_word: 'caper',
    last_definition: 'A playful leap or skip.',
    chat_messages: CHAT_MESSAGES,
    daily_double_available: false,
  },
  completed: {
    guesses: [
      {
        guess: 'slate',
        result: ['correct', 'absent', 'present', 'present', 'correct'],
        emoji: '🐶',
        points: 4,
      },
      {
        guess: 'stare',
        result: ['correct', 'correct', 'correct', 'correct', 'correct'],
        emoji: '🦊',
        points: 9,
      },
    ],
    target_word: 'stare',
    is_over: true,
    leaderboard: PLAYERS,
    active_emojis: PLAYERS.map(({ emoji }) => emoji),
    winner_emoji: '🦊',
    max_rows: 6,
    phase: 'finished',
    past_games: [PAST_GAME],
    definition: 'To look steadily or intently.',
    last_word: 'stare',
    last_definition: 'To look steadily or intently.',
    chat_messages: CHAT_MESSAGES,
    daily_double_available: false,
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath);
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  }[extension] || 'application/octet-stream';
}

async function fulfillFile(route, relativePath) {
  const filePath = path.resolve(FRONTEND_ROOT, relativePath);
  if (!filePath.startsWith(`${FRONTEND_ROOT}${path.sep}`) || !fs.existsSync(filePath)) {
    await route.fulfill({ status: 404, body: 'Not found' });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: contentTypeFor(filePath),
    body: fs.readFileSync(filePath),
  });
}

function responseState(state, emoji) {
  return {
    ...clone(state),
    daily_double_available: emoji ? false : undefined,
  };
}

async function fulfillJson(route, payload, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload),
  });
}

async function installLobbyRoutes(page, statesByCode) {
  await page.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const lobbyPageMatch = url.pathname.match(/^\/lobby\/([A-Z0-9]{6})\/?$/);
    const lobbyAssetMatch = url.pathname.match(/^\/lobby\/static\/(.+)$/);
    const rootAssetMatch = url.pathname.match(/^\/static\/(.+)$/);
    const apiMatch = url.pathname.match(/^\/lobby\/([A-Z0-9]{6})\/(state|emoji|stream|chat|guess|hint|reset|leave|kick)$/);

    if (lobbyPageMatch && statesByCode.has(lobbyPageMatch[1])) {
      await fulfillFile(route, 'game.html');
      return;
    }

    if (lobbyAssetMatch || rootAssetMatch) {
      await fulfillFile(route, `static/${(lobbyAssetMatch || rootAssetMatch)[1]}`);
      return;
    }

    if (!apiMatch || !statesByCode.has(apiMatch[1])) {
      await route.fulfill({ status: 404, body: 'Unknown fixture route' });
      return;
    }

    const [, lobbyCode, action] = apiMatch;
    const state = statesByCode.get(lobbyCode);
    const requestBody = request.postDataJSON?.() || {};

    if (action === 'state') {
      await fulfillJson(route, responseState(state, url.searchParams.get('emoji')));
      return;
    }

    if (action === 'stream') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        headers: { 'Cache-Control': 'no-cache' },
        body: `data: ${JSON.stringify(responseState(state))}\n\n`,
      });
      return;
    }

    if (action === 'emoji') {
      await fulfillJson(route, {
        status: 'ok',
        emoji: requestBody.emoji || '🐶',
        player_id: requestBody.player_id || 'fixture-player',
      });
      return;
    }

    if (action === 'chat') {
      state.chat_messages.push({ emoji: requestBody.emoji || '🐶', text: requestBody.text || '' });
      await fulfillJson(route, { messages: clone(state.chat_messages) });
      return;
    }

    if (action === 'guess') {
      await fulfillJson(route, {
        status: 'ok',
        state: responseState(state, requestBody.emoji),
        won: false,
        over: state.is_over,
        pointsDelta: 0,
      });
      return;
    }

    if (action === 'hint') {
      await fulfillJson(route, { status: 'ok', hint: { row: state.guesses.length, col: requestBody.col, letter: 'a' } });
      return;
    }

    await fulfillJson(route, { status: 'ok', state: responseState(state) });
  });
}

const test = base.extend({
  deterministicLobby: async ({ page }, use) => {
    const statesByCode = new Map([
      [LOBBY_CODES.active, clone(FIXTURE_STATES.active)],
      [LOBBY_CODES.completed, clone(FIXTURE_STATES.completed)],
    ]);

    await installLobbyRoutes(page, statesByCode);
    await page.addInitScript(() => {
      window.__WORD_SQUAD_TEST_DIAGNOSTICS__ = true;
      localStorage.setItem('myEmoji', '🐶');
      localStorage.setItem('playerId', 'fixture-player');
      localStorage.setItem('soundEnabled', 'false');
    });

    const open = async (scenario = 'active') => {
      if (!Object.hasOwn(LOBBY_CODES, scenario)) {
        throw new Error(`Unknown deterministic lobby scenario: ${scenario}`);
      }

      const code = LOBBY_CODES[scenario];
      await page.goto(`${FIXTURE_ORIGIN}/lobby/${code}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#board .tile')).toHaveCount(30);
      await expect(page.locator('#leaderboard .leaderboard-entry')).toHaveCount(PLAYERS.length);
      await expect(page.locator('#historyList .history-item')).not.toHaveCount(0);

      await page.evaluate(() => {
        // Keep the fixture focused on initialized gameplay. These transient
        // surfaces are independent of lobby state and otherwise obscure the UI.
        [
          'waitingOverlay',
          'shareModal',
          'emojiModal',
          'closeCallPopup',
          'infoPopup',
          'messagePopup',
        ].forEach((id) => {
          const element = document.getElementById(id);
          if (element) element.style.display = 'none';
        });
      });

      return {
        code,
        state: clone(statesByCode.get(code)),
        url: `${FIXTURE_ORIGIN}/lobby/${code}`,
      };
    };

    await use({
      open,
      openActive: () => open('active'),
      openCompleted: () => open('completed'),
      codes: LOBBY_CODES,
      states: clone(FIXTURE_STATES),
    });
  },
});

module.exports = {
  test,
  expect,
  FIXTURE_STATES,
  LOBBY_CODES,
};
