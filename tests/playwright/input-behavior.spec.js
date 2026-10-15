const {
  test,
  expect,
  FIXTURE_STATES,
} = require('./fixtures/deterministic-lobby');

const ACTIVE_ROW_START = FIXTURE_STATES.active.guesses.length * 5;

function activeGuessTiles(page) {
  return page.locator('#board .tile').evaluateAll((tiles, rowStart) => (
    tiles
      .slice(rowStart, rowStart + 5)
      // Greens ahead of the typing position remain ghost guidance.
      .map((tile) => tile.classList.contains('ghost') ? '' : tile.textContent.trim())
      .join('')
  ), ACTIVE_ROW_START);
}

async function expectActiveGuess(page, guess) {
  await expect.poll(() => activeGuessTiles(page)).toBe(guess.toUpperCase());
}

async function enterVirtualGuess(page, guess) {
  for (const letter of guess) {
    await page.locator(`.key[data-key="${letter}"]`).click();
  }
}

test.describe('green letter autofill', () => {
  test.use({ viewport: { width: 1200, height: 900 }, hasTouch: false });

  for (const input of ['virtual', 'physical', 'guess field']) {
    test(`${input} entry fills _ A _ A L, animates greens, and submits the complete word`, async ({ page, deterministicLobby }) => {
      const state = {
        ...FIXTURE_STATES.active,
        guesses: [{ guess: 'canal', result: ['absent', 'correct', 'absent', 'correct', 'correct'], emoji: '🐶', points: 3 }],
      };
      await page.route(/\/lobby\/ACT001\/(state|stream)(\?|$)/, async route => {
        if (new URL(route.request().url()).pathname.endsWith('/stream')) {
          await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(state)}\n\n` });
        } else {
          await route.fulfill({ json: state });
        }
      });
      await deterministicLobby.openActive();
      await expect(page.locator('#board .tile').nth(6)).not.toHaveClass(/letter-in/);
      // Keep the animation observable even on slower browser workers.
      await page.addStyleTag({ content: '.tile.letter-in { animation-duration: 10s; }' });
      const field = page.locator('#guessInput');
      const tiles = page.locator('#board .tile');
      await expect(field).toHaveValue('');

      const type = async letter => {
        if (input === 'virtual') await page.locator(`.key[data-key="${letter}"]`).click();
        else {
          if (input === 'guess field') await field.focus();
          else await field.blur();
          await page.keyboard.type(letter);
        }
      };
      const backspace = async () => {
        if (input === 'virtual') await page.locator('.key[data-key="Backspace"]').click();
        else await page.keyboard.press('Backspace');
      };
      await type('n');
      await expect(field).toHaveValue('NA');
      await expect(tiles.nth(6)).toHaveClass(/correct/);
      await expect(tiles.nth(6)).toHaveClass(/letter-in/);
      await expect(tiles.nth(6)).not.toHaveClass(/ghost/);
      await type('v');
      await expect(field).toHaveValue('NAVAL');
      await expect(tiles.nth(8)).toHaveClass(/correct/);
      await expect(tiles.nth(9)).toHaveClass(/correct/);
      await backspace();
      await expect(field).toHaveValue('NA');
      await expect(tiles.nth(8)).toHaveClass(/ghost/);
      await backspace();
      await expect(field).toHaveValue('');
      await type('n');
      await type('v');

      const request = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/guess'));
      if (input === 'virtual') await page.locator('.key[data-key="Enter"]').click();
      else await page.keyboard.press('Enter');
      expect((await request).postDataJSON().guess).toBe('naval');
    });
  }
});

test.describe('Phase 2.7 input behavior', () => {
  test.use({ viewport: { width: 1200, height: 900 }, hasTouch: false });

  test('a virtual key adds one typed character and fills leading greens', async ({
    page,
    deterministicLobby,
  }) => {
    await deterministicLobby.openActive();

    await page.locator('.key[data-key="q"]').click();

    await expectActiveGuess(page, 'sq');
    await expect(page.locator('#guessInput')).toHaveValue('SQ');
  });

  test('virtual Backspace removes exactly one character', async ({
    page,
    deterministicLobby,
  }) => {
    await deterministicLobby.openActive();
    await enterVirtualGuess(page, 'qw');

    await page.locator('.key[data-key="Backspace"]').click();

    await expectActiveGuess(page, 'sq');
    await expect(page.locator('#guessInput')).toHaveValue('SQ');
  });

  test('virtual Enter submits exactly once', async ({ page, deterministicLobby }) => {
    let guessRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/guess')) {
        guessRequests += 1;
      }
    });

    await deterministicLobby.openActive();
    await enterVirtualGuess(page, 'tav');

    await page.locator('.key[data-key="Enter"]').click();

    await expect.poll(() => guessRequests).toBe(1);
    await expectActiveGuess(page, '');
    await page.waitForTimeout(100);
    expect(guessRequests).toBe(1);
  });

  test('physical typing works without focusing the guess field', async ({
    page,
    deterministicLobby,
  }) => {
    await deterministicLobby.openActive();
    await page.locator('#guessInput').blur();
    await expect(page.locator('#guessInput')).not.toBeFocused();

    await page.keyboard.type('tar');

    await expectActiveGuess(page, 'stare');
    await expect(page.locator('#guessInput')).toHaveValue('STARE');
    await expect(page.locator('#guessInput')).not.toBeFocused();
  });

  test('chat typing never changes the active guess', async ({
    page,
    deterministicLobby,
  }) => {
    await deterministicLobby.openActive();
    await page.locator('.key[data-key="q"]').click();
    await page.locator('#chatNotify').click();
    await expect(page.locator('#chatInput')).toBeFocused();

    await page.keyboard.type('chat');

    await expect(page.locator('#chatInput')).toHaveValue('chat');
    await expectActiveGuess(page, 'sq');
  });

  test('typing while a modal control has focus never changes the active guess', async ({
    page,
    deterministicLobby,
  }) => {
    await deterministicLobby.openActive();
    await page.locator('.key[data-key="q"]').click();
    await page.locator('#optionsToggle').click();
    await page.locator('#menuInfo').click();
    await expect(page.locator('#infoPopup')).toBeVisible();
    await expect(page.locator('#infoClose')).toBeFocused();

    await page.keyboard.type('word');

    await expectActiveGuess(page, 'sq');
  });
});

test.describe('Phase 2.7 touch input behavior', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a touch virtual-key activation does not focus the guess field', async ({
    page,
    deterministicLobby,
  }) => {
    await deterministicLobby.openActive();
    const guessInput = page.locator('#guessInput');
    await guessInput.blur();

    await page.locator('.key[data-key="q"]').tap();

    await expectActiveGuess(page, 'sq');
    await expect(guessInput).not.toBeFocused();
    await expect(page.locator('.key[data-key="q"]')).toBeFocused();
  });
});
