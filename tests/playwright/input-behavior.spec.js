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
      // Correct-position hints remain visible as ghost letters in the active
      // row. They are board guidance, not part of currentGuess.
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

test.describe('Phase 2.7 input behavior', () => {
  test.use({ viewport: { width: 1200, height: 900 }, hasTouch: false });

  test('a virtual key adds exactly one character per activation', async ({
    page,
    deterministicLobby,
  }) => {
    await deterministicLobby.openActive();

    await page.locator('.key[data-key="q"]').click();

    await expectActiveGuess(page, 'q');
    await expect(page.locator('#guessInput')).toHaveValue('Q');
  });

  test('virtual Backspace removes exactly one character', async ({
    page,
    deterministicLobby,
  }) => {
    await deterministicLobby.openActive();
    await enterVirtualGuess(page, 'qw');

    await page.locator('.key[data-key="Backspace"]').click();

    await expectActiveGuess(page, 'q');
    await expect(page.locator('#guessInput')).toHaveValue('Q');
  });

  test('virtual Enter submits exactly once', async ({ page, deterministicLobby }) => {
    let guessRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/guess')) {
        guessRequests += 1;
      }
    });

    await deterministicLobby.openActive();
    await enterVirtualGuess(page, 'stave');

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

    await page.keyboard.type('crate');

    await expectActiveGuess(page, 'crate');
    await expect(page.locator('#guessInput')).toHaveValue('CRATE');
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
    await expectActiveGuess(page, 'q');
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
    // The legacy options-menu close animation restores focus after 300 ms.
    // Focus the modal control after that transition so this assertion tests
    // input routing rather than the pending menu animation.
    await page.waitForTimeout(350);
    await page.locator('#infoClose').focus();
    await expect(page.locator('#infoClose')).toBeFocused();

    await page.keyboard.type('word');

    await expectActiveGuess(page, 'q');
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

    await expectActiveGuess(page, 'q');
    await expect(guessInput).not.toBeFocused();
    await expect(page.locator('.key[data-key="q"]')).toBeFocused();
  });
});
