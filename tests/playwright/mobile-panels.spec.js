const { test, expect } = require('./fixtures/deterministic-lobby');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function openPanel(page, menuItem) {
  await page.locator('#optionsToggle').tap();
  await page.locator(menuItem).tap();
}

test('empty panels explain what will appear and replace the message when content arrives', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  const panels = [
    ['#historyBox', '#menuHistory', '#historyClose', 'No guesses yet. Make a guess to start the history.'],
    ['#definitionBox', '#menuDefinition', '#definitionClose', 'Finish a word to see its definition.'],
    ['#chatBox', null, '#chatClose', 'No messages yet. Say hello!'],
  ];
  const empty = { ...deterministicLobby.states.active, guesses: [], past_games: [], last_word: null, last_definition: null, chat_messages: [] };
  const applyState = async state => {
    deterministicLobby.setState('active', state);
    await page.evaluate(async () => {
      const { default: manager } = await import('/static/js/gameStateManager.js');
      manager.applyState(await fetch('/lobby/ACT001/state').then(response => response.json()));
    });
  };
  for (const [panel, menuItem, close, message] of panels) {
    await applyState(empty);
    if (menuItem) await openPanel(page, menuItem);
    else await page.locator('#chatNotify').tap();
    const emptyState = page.locator(`${panel} .panel-empty-state`);
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toHaveText(message);
    const textBounds = await emptyState.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const bounds = range.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    });
    const closeBounds = await page.locator(close).boundingBox();
    expect(textBounds.x + textBounds.width <= closeBounds.x || textBounds.y >= closeBounds.y + closeBounds.height).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${panel.slice(1)}-empty.png`) });
    await applyState(deterministicLobby.states.active);
    await expect(emptyState).toBeHidden();
    await page.locator(close).tap();
  }
});

test('history aligns words with signed and fractional scores without horizontal scrolling', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(
      () => requestAnimationFrame(() => requestAnimationFrame(resolve))
    )));
    if (!await page.locator('#historyBox').isVisible()) await openPanel(page, '#menuHistory');
    await page.evaluate(async () => {
      const { renderHistory } = await import('/static/js/history.js');
      renderHistory(document.getElementById('historyList'), [8, 0.5, -1, 1, 1.5, -3, -10.5].map(points => ({
        guess: 'caper', result: ['correct', 'correct', 'correct', 'correct', 'correct'],
        emoji: '🦖', points,
      })));
    });
    const layout = await page.locator('#historyList').evaluate(list => {
      const bounds = list.getBoundingClientRect();
      const wordStarts = [...list.querySelectorAll('.history-guess-tiles')]
        .map(element => element.getBoundingClientRect().left);
      return {
        stampGap: Math.min(...[...list.querySelectorAll('.history-item')].map(row => {
          const emoji = row.querySelector('.history-emoji');
          const range = document.createRange();
          range.selectNodeContents(emoji);
          return row.querySelector('.history-guess-tiles').getBoundingClientRect().left
            - range.getBoundingClientRect().right;
        })),
        wordStartSpread: Math.max(...wordStarts) - Math.min(...wordStarts),
        width: list.clientWidth,
        scrollWidth: list.scrollWidth,
        itemsFit: [...list.querySelectorAll('.tile, .history-points')].every(element => {
          const rect = element.getBoundingClientRect();
          return rect.left >= bounds.left && rect.right <= bounds.right + 1;
        }),
        squareTiles: [...list.querySelectorAll('.tile')].every(element => {
          const rect = element.getBoundingClientRect();
          return Math.abs(rect.width - rect.height) <= 1;
        }),
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.itemsFit).toBe(true);
    expect(layout.squareTiles).toBe(true);
    expect(layout.wordStartSpread).toBeLessThanOrEqual(1);
    expect(layout.stampGap).toBeGreaterThanOrEqual(12);
    if (await page.locator('#historyClose').isVisible()) await page.locator('#historyClose').tap();
  }
});

test('panel popup and backdrop paint above board stamps and chat controls', async ({ page, deterministicLobby }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await deterministicLobby.openActive();
  await openPanel(page, '#menuHistory');
  const layers = await page.evaluate(() => {
    const panel = document.getElementById('historyBox');
    const panelBounds = panel.getBoundingClientRect();
    const backdrop = document.getElementById('panelBackdrop');
    return [...document.querySelectorAll('.emoji-stamp, #chatNotify')].map(element => {
      const bounds = element.getBoundingClientRect();
      // Stamps ignore pointer events, so temporarily include them in the paint-order probe.
      const previous = element.style.pointerEvents;
      element.style.pointerEvents = 'auto';
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height / 2;
      const stack = document.elementsFromPoint(x, y);
      element.style.pointerEvents = previous;
      const surface = x >= panelBounds.left && x <= panelBounds.right
        && y >= panelBounds.top && y <= panelBounds.bottom ? panel : backdrop;
      return {
        element: element.id || element.className,
        covered: stack.indexOf(surface) >= 0 && stack.indexOf(surface) < stack.indexOf(element),
      };
    });
  });
  for (const layer of layers) expect(layer.covered, layer.element).toBe(true);
});

test('chat close button stays above messages and Send even with no messages', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await page.locator('#chatNotify').tap();
  for (const empty of [false, true]) {
    if (empty) await page.locator('#chatMessages').evaluate(element => element.replaceChildren());
    const close = await page.locator('#chatClose').boundingBox();
    const send = await page.locator('#chatSend').boundingBox();
    const messages = await page.locator('#chatMessages').boundingBox();
    expect(close.y + close.height).toBeLessThanOrEqual(send.y);
    if (!empty) expect(close.y + close.height).toBeLessThanOrEqual(messages.y);
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#chatClose').tap();
  await expect(page.locator('#chatBox')).toBeHidden();
});

test('definition closes on the first tap and stays closed after a state refresh', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await openPanel(page, '#menuDefinition');
  await expect(page.locator('#definitionBox')).toBeVisible();
  await page.locator('#definitionClose').tap();
  await expect(page.locator('#definitionBox')).toBeHidden();
  await page.evaluate(async () => {
    const { default: manager } = await import('/static/js/gameStateManager.js');
    const state = await fetch('/lobby/ACT001/state').then(response => response.json());
    manager.applyState(state);
  });
  await expect(page.locator('#definitionBox')).toBeHidden();
  await expect(page.locator('#panelBackdrop')).toBeHidden();
});

test('closing one panel does not block the next panel close button', async ({ page, deterministicLobby }) => {
  await deterministicLobby.openActive();
  await openPanel(page, '#menuHistory');
  // Deliver the clicks together to deterministically exercise rapid panel switching.
  await page.evaluate(() => {
    document.getElementById('historyClose').click();
    document.getElementById('chatNotify').click();
    document.getElementById('chatClose').click();
  });
  await expect(page.locator('#historyBox')).toBeHidden();
  await expect(page.locator('#chatBox')).toBeHidden();
});
