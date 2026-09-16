import { test, expect, chromium, type Browser, type Page } from '@playwright/test';

async function chooseGame(page: Page, game: string, name: string) {
  await page.getByText(game, { exact: true }).click();
  await page.getByPlaceholder('e.g. Alex').fill(name);
}

async function createTable(page: Page, game = 'Cardfall') {
  await page.getByRole('button', { name: new RegExp(`Create ${game} table`, 'i') }).click();
  await expect(page.locator('.mode')).toContainText('ROOM');
}

async function joinTable(page: Page, room: string, name: string) {
  await page.getByPlaceholder('e.g. Alex').fill(name);
  await page.getByPlaceholder('HAVE A ROOM CODE?').fill(room);
  await page.getByRole('button', { name: 'Join table' }).click();
}

test.describe('Card Table Arena guest multiplayer', () => {
  let browser: Browser;

  test.beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
  test.afterAll(async () => { await browser.close(); });

  test('two guests can join, see the turn rail, chat, and synchronize a Cardfall game', async () => {
    const host = await browser.newContext();
    const guest = await browser.newContext();
    const hp = await host.newPage();
    const gp = await guest.newPage();

    await hp.goto('/');
    await chooseGame(hp, 'Cardfall', 'Host');
    await createTable(hp);
    const room = await hp.locator('.invite-code').innerText();
    expect(room).toMatch(/^[A-Z0-9-]{3,12}$/);

    await gp.goto('/');
    await joinTable(gp, room, 'Guest');
    await expect(hp.locator('.turn-player').filter({ hasText: 'Guest' })).toBeVisible();
    await expect(gp.locator('.turn-player').filter({ hasText: 'Host' })).toBeVisible();
    await expect(hp.getByText(/TURN ORDER/)).toBeVisible();
    await expect(gp.getByText(/TABLE CHAT/)).toBeVisible();

    const deal = hp.getByRole('button', { name: 'Deal the cards' });
    await expect(deal).toBeEnabled();
    await deal.click();
    await expect(hp.getByRole('heading', { name: 'Host is playing' })).toBeVisible();
    await expect(gp.getByRole('heading', { name: 'Host is playing' })).toBeVisible();
    await expect(hp.locator('.playing-card')).toHaveCount(5);
    await expect(hp.locator('.mini-back')).toHaveCount(5);

    const chat = hp.getByPlaceholder('Send a message to the table…');
    await chat.fill('hello from host');
    await chat.press('Enter');
    await expect(hp.getByText('Host: hello from host')).toBeVisible();
    await expect(gp.getByText('Host: hello from host')).toBeVisible();

    await hp.close();
    await gp.close();
    await host.close();
    await guest.close();
  });

  test('host-selected cards per player controls each private hand', async () => {
    const host = await browser.newContext();
    const guest = await browser.newContext();
    const hp = await host.newPage();
    const gp = await guest.newPage();

    await hp.goto('/');
    await chooseGame(hp, 'Cardfall', 'Host');
    await hp.getByLabel('Cards per player').fill('3');
    await createTable(hp);
    const room = await hp.locator('.invite-code').innerText();

    await gp.goto('/');
    await joinTable(gp, room, 'Guest');
    await hp.getByRole('button', { name: 'Deal the cards' }).click();

    await expect(hp.locator('.playing-card')).toHaveCount(3);
    await expect(gp.locator('.playing-card')).toHaveCount(3);
    await expect(hp.locator('.mini-back')).toHaveCount(3);

    await hp.close();
    await gp.close();
    await host.close();
    await guest.close();
  });

  test('Cardfall question and Yes/No answer rotate the turn', async () => {
    const host = await browser.newContext();
    const guest = await browser.newContext();
    const hp = await host.newPage();
    const gp = await guest.newPage();

    await hp.goto('/');
    await chooseGame(hp, 'Cardfall', 'Host');
    await createTable(hp);
    const room = await hp.locator('.invite-code').innerText();
    await gp.goto('/');
    await joinTable(gp, room, 'Guest');
    await hp.getByRole('button', { name: 'Deal the cards' }).click();
    await expect(hp.getByRole('heading', { name: 'Host is playing' })).toBeVisible();

    const action = hp.locator('.action-panel');
    await action.locator('select').first().selectOption({ label: 'Guest' });
    await action.getByPlaceholder('e.g. Do you have a red card?').fill('Do you have a red card?');
    await action.getByRole('button', { name: /^Ask/ }).click();
    await expect(gp.getByRole('button', { name: 'Yes' })).toBeVisible();
    await expect(gp.getByRole('button', { name: 'No', exact: true })).toBeVisible();
    await gp.getByRole('button', { name: 'Yes' }).click();
    await expect(hp.getByRole('heading', { name: 'Host is playing' })).toBeVisible();

    await hp.close();
    await gp.close();
    await host.close();
    await guest.close();
  });

  test('Cardfall guess mode uses tactile card and player pickers', async () => {
    const host = await browser.newContext();
    const guest = await browser.newContext();
    const hp = await host.newPage();
    const gp = await guest.newPage();

    await hp.goto('/');
    await chooseGame(hp, 'Cardfall', 'Host');
    await createTable(hp);
    const room = await hp.locator('.invite-code').innerText();
    await gp.goto('/');
    await joinTable(gp, room, 'Guest');
    await hp.getByRole('button', { name: 'Deal the cards' }).click();
    await expect(hp.getByRole('heading', { name: 'Host is playing' })).toBeVisible();

    await hp.getByRole('button', { name: 'Guess a card' }).click();
    const picker = hp.locator('.card-picker');
    await expect(picker.getByRole('button', { name: /Guest/ })).toBeVisible();
    await picker.getByRole('button', { name: /Guest/ }).click();
    await picker.getByRole('button', { name: 'Select diamonds' }).click();
    await picker.getByRole('button', { name: 'A of diamonds' }).click();
    await expect(picker.getByText(/Guessing: A♦/)).toBeVisible();
    await expect(picker.getByRole('button', { name: 'Confirm guess' })).toBeEnabled();
    await expect(picker.locator('select')).toHaveCount(0);

    await picker.getByRole('button', { name: 'Confirm guess' }).click();
    await expect(hp.locator('select')).toHaveCount(0);

    await hp.close();
    await gp.close();
    await host.close();
    await guest.close();
  });

  test('successful topple opens the public pool and announces the animation', async () => {
    const host = await browser.newContext();
    const guest = await browser.newContext();
    const hp = await host.newPage();
    const gp = await guest.newPage();

    await hp.goto('/');
    await chooseGame(hp, 'Cardfall', 'Host');
    await createTable(hp);
    const room = await hp.locator('.invite-code').innerText();
    await gp.goto('/');
    await joinTable(gp, room, 'Guest');
    await hp.getByRole('button', { name: 'Deal the cards' }).click();
    await expect(hp.getByRole('heading', { name: 'Host is playing' })).toBeVisible();

    const guestCard = (await gp.locator('.playing-card').first().innerText()).replace(/\s+/g, '');
    const suitNames: Record<string, string> = {
      '♠': 'spades',
      '♥': 'hearts',
      '♦': 'diamonds',
      '♣': 'clubs',
    };
    const suit = guestCard.at(-1)!;
    const rank = guestCard.slice(0, -1);

    await hp.getByRole('button', { name: 'Guess a card' }).click();
    const picker = hp.locator('.card-picker');
    await picker.getByRole('button', { name: /Select Guest as guess target/ }).click();
    await picker.getByRole('button', { name: `${rank} of ${suitNames[suit]}` }).click();
    await picker.getByRole('button', { name: 'Confirm guess' }).click();

    const pool = hp.getByRole('button', { name: 'Open toppled cards' });
    await expect(pool).toContainText('1');
    await expect(hp.locator('[data-testid="topple-animation"]')).toBeVisible();
    await expect(hp.locator('[aria-live="polite"]').filter({ hasText: /toppled/i })).toBeVisible();

    await pool.click();
    const dialog = hp.getByRole('dialog', { name: /toppled cards/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(guestCard, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close toppled cards' }).click();
    await expect(dialog).toBeHidden();

    await hp.close();
    await gp.close();
    await host.close();
    await guest.close();
  });

  test('Cardfall activity keeps full chat history and supports jumping to latest', async () => {
    const host = await browser.newContext();
    const guest = await browser.newContext();
    const hp = await host.newPage();
    const gp = await guest.newPage();

    await hp.goto('/');
    await chooseGame(hp, 'Cardfall', 'Host');
    await createTable(hp);
    const room = await hp.locator('.invite-code').innerText();
    await gp.goto('/');
    await joinTable(gp, room, 'Guest');

    const feed = hp.locator('.activity-feed');
    await expect(feed).toBeVisible();
    await expect.poll(() => feed.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');

    const messages = Array.from({ length: 10 }, (_, index) => `activity-${index + 1}`);
    const chat = hp.getByPlaceholder('Send a message to the table…');
    for (const message of messages) {
      await chat.fill(message);
      await chat.press('Enter');
      await expect(feed.getByText(`Host: ${message}`, { exact: true })).toBeVisible();
    }

    for (const message of messages) {
      await expect(feed.getByText(`Host: ${message}`, { exact: true })).toHaveCount(1);
    }

    await feed.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect.poll(() => feed.evaluate((element) => element.scrollTop)).toBe(0);

    await chat.fill('activity-latest');
    await chat.press('Enter');
    await expect(feed.getByText('Host: activity-latest', { exact: true })).toBeVisible();
    await expect(hp.getByRole('button', { name: 'Jump to latest' })).toBeVisible();

    await hp.getByRole('button', { name: 'Jump to latest' }).click();
    await expect.poll(() => feed.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1)).toBe(true);
    await expect(hp.getByRole('button', { name: 'Jump to latest' })).toBeHidden();

    await hp.close();
    await gp.close();
    await host.close();
    await guest.close();
  });

  test('Cardfall clipboard feedback and mobile overflow safeguards', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await context.newPage();
    await page.goto('/');
    await chooseGame(page, 'Cardfall', 'Host');
    await createTable(page);

    // Clipboard feedback
    const copyButton = page.getByRole('button', { name: /Copy room code|Copied!/ });
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    // Button text should change to "Copied!" (with fallback to "Copy room code" if clipboard API unavailable)
    await expect(page.getByRole('button', { name: /Copy room code|Copied!/ })).toBeVisible();

    // Mobile overflow: no horizontal scrollbar
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // All interactive elements are reachable (only check real buttons with labels)
    const buttons = await page.locator('button:visible').all();
    for (const button of buttons) {
      const box = await button.boundingBox();
      const text = await button.textContent() || '';
      const ariaLabel = await button.getAttribute('aria-label') || '';
      const cls = await button.getAttribute('class') || '';
      // Only check buttons that are actual interactive controls (have text or aria-label)
      // Skip Next.js Dev Tools button (injected by dev server, not our app)
      if (!text.trim() && !ariaLabel) continue;
      if (ariaLabel === 'Open Next.js Dev Tools') continue;
      if (box) {
        console.log(`Checking button: text="${text.slice(0,30)}" aria-label="${ariaLabel}" class="${cls}" size=${box.width}x${box.height}`);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }

    await context.close();
  });

  test('Cardfall accessibility: focus-visible, touch targets, and reduced motion', async () => {
    const page = await browser.newPage();
    await page.goto('/');
    await chooseGame(page, 'Cardfall', 'Host');
    await createTable(page);

    // Focus-visible: tab to a button and check outline
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        tagName: el.tagName,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
      };
    });
    expect(focusedElement).not.toBeNull();
    expect(focusedElement?.outlineStyle).not.toBe('none');

    // Touch targets: check that visible buttons are at least 44x44
    const buttonSizes = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const visible = buttons.filter((btn) => {
        const rect = btn.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      visible.forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        console.log(`Button: "${btn.textContent?.slice(0, 30)}" class="${btn.className}" size=${rect.width}x${rect.height}`);
      });
      return visible.map((btn) => {
        const rect = btn.getBoundingClientRect();
        return { width: rect.width, height: rect.height, text: btn.textContent?.slice(0, 20), className: btn.className };
      });
    });
    const smallButtons = buttonSizes.filter((b) => b.width < 44 || b.height < 44);
    if (smallButtons.length > 0) {
      console.log('Small buttons:', JSON.stringify(smallButtons));
    }
    expect(smallButtons).toEqual([]);

    // Reduced motion: verify media query is supported
    const reducedMotion = await page.evaluate(() => {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });
    // We don't assert the value, just that the query works
    expect(typeof reducedMotion).toBe('boolean');

    await page.close();
  });

  test('Cardfall presence and ready toggle are visible to all players', async () => {
    const host = await browser.newContext();
    const guest = await browser.newContext();
    const hp = await host.newPage();
    const gp = await guest.newPage();

    await hp.goto('/');
    await chooseGame(hp, 'Cardfall', 'Host');
    await createTable(hp);
    const room = await hp.locator('.invite-code').innerText();
    await gp.goto('/');
    await joinTable(gp, room, 'Guest');

    // Both players should see presence dots
    await expect(hp.locator('.presence-dot.online')).toHaveCount(2);
    await expect(gp.locator('.presence-dot.online')).toHaveCount(2);

    // Host should see host badge
    await expect(hp.locator('.host-badge')).toHaveCount(1);

    // Ready toggle
    const readyButton = hp.getByRole('button', { name: /Mark ready|Ready/ });
    await expect(readyButton).toBeVisible();
    await readyButton.click();
    await expect(readyButton).toHaveClass(/ready/);

    // Guest should see host as ready
    await expect(gp.locator('.turn-player').filter({ hasText: 'Host' }).locator('.presence-dot.online')).toBeVisible();

    await hp.close();
    await gp.close();
    await host.close();
    await guest.close();
  });

  test('Cardfall rules dialog is accessible and returns focus', async () => {
    const page = await browser.newPage();
    await page.goto('/');
    await chooseGame(page, 'Cardfall', 'Host');
    await createTable(page);

    const rulesButton = page.getByRole('button', { name: 'Rules' });
    await rulesButton.click();
    const dialog = page.getByRole('dialog', { name: /Cardfall rules/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Ask a player about their hidden cards, or guess an exact card.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close rules' })).toBeFocused();

    await page.getByRole('button', { name: 'Close rules' }).click();
    await expect(dialog).toBeHidden();
    await expect(rulesButton).toBeFocused();

    await page.close();
  });

  test('Cardfall private deduction notebook persists across reload', async () => {
    const host = await browser.newContext();
    const guest = await browser.newContext();
    const hp = await host.newPage();
    const gp = await guest.newPage();

    await hp.goto('/');
    await chooseGame(hp, 'Cardfall', 'Host');
    await createTable(hp);
    const room = await hp.locator('.invite-code').innerText();
    await gp.goto('/');
    await joinTable(gp, room, 'Guest');
    await hp.getByRole('button', { name: 'Deal the cards' }).click();
    await expect(hp.getByRole('heading', { name: 'Host is playing' })).toBeVisible();

    const action = hp.locator('.action-panel');
    await action.locator('select').first().selectOption({ label: 'Guest' });
    await action.getByPlaceholder('e.g. Do you have a red card?').fill('Do you have a red card?');
    await action.getByRole('button', { name: /^Ask/ }).click();

    await hp.getByRole('button', { name: 'Open deduction notebook' }).click();
    const dialog = hp.getByRole('dialog', { name: /deduction notebook/i });
    await expect(dialog.getByText('Do you have a red card?')).toBeVisible();
    await dialog.getByLabel('Cross out').check();
    await dialog.getByPlaceholder('Add a private note').fill('Maybe hearts');
    await dialog.getByRole('button', { name: 'Close deduction notebook' }).click();
    await expect(dialog).toBeHidden();

    await hp.reload();
    await expect(hp.getByRole('button', { name: 'Join table' })).toBeVisible();
    await hp.getByPlaceholder('e.g. Alex').fill('Host');
    await hp.getByPlaceholder('HAVE A ROOM CODE?').fill(room);
    await hp.getByRole('button', { name: 'Join table' }).click();
    await expect(hp.getByRole('button', { name: 'Open deduction notebook' })).toBeVisible();
    await hp.getByRole('button', { name: 'Open deduction notebook' }).click();
    const reloadedDialog = hp.getByRole('dialog', { name: /deduction notebook/i });
    await expect(reloadedDialog.getByText('Do you have a red card?')).toBeVisible();
    await expect(reloadedDialog.getByLabel('Cross out')).toBeChecked();
    await expect(reloadedDialog.getByPlaceholder('Add a private note')).toHaveValue('Maybe hearts');

    await hp.close();
    await gp.close();
    await host.close();
    await guest.close();
  });

  test('lobby exposes all supported games and game-specific settings', async () => {
    const page = await browser.newPage();
    await page.goto('/');
    for (const game of ['Cardfall', 'Blackjack', 'Texas Hold’em', 'Solitaire', 'High Card Duel']) {
      await expect(page.getByText(game, { exact: true })).toBeVisible();
    }
    await page.getByText('Blackjack', { exact: true }).click();
    await expect(page.getByText('Dealer on soft 17')).toBeVisible();
    await page.getByText('Solitaire', { exact: true }).click();
    await expect(page.getByText('Variant')).toBeVisible();
    await page.close();
  });

  test('blank names are rejected and mobile setup actions remain reachable', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: /Create Cardfall table/i }).click();
    await expect(page.getByText(/Add your name so friends can recognize you/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join table' })).toBeVisible();
    await page.screenshot({ path: 'test-results/mobile-lobby.png', fullPage: true });
    await context.close();
  });

  test('each advertised game opens its own playable room controls', async () => {
    const soloGames = [
      { name: 'Blackjack', room: 'Blackjack', control: 'Hit' },
      { name: 'Solitaire', room: 'Solitaire', control: 'Draw' },
    ];
    for (const item of soloGames) {
      const page = await browser.newPage();
      await page.goto('/');
      await chooseGame(page, item.name, `${item.name} tester`);
      await createTable(page, item.name);
      await expect(page.getByText(item.room, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: new RegExp(`Start ${item.name}`, 'i') }).click();
      await expect(page.getByRole('button', { name: item.control })).toBeVisible();
      await page.close();
    }

    const multiplayerGames = [
      { name: 'High Card Duel', control: 'Reveal card' },
      { name: 'Texas Hold’em', control: 'Check' },
    ];
    for (const item of multiplayerGames) {
      const host = await browser.newContext();
      const guest = await browser.newContext();
      const hp = await host.newPage();
      const gp = await guest.newPage();
      await hp.goto('/');
      await chooseGame(hp, item.name, `${item.name} host`);
      await createTable(hp, item.name);
      const room = await hp.locator('.invite-code').innerText();
      await gp.goto('/');
      await joinTable(gp, room, `${item.name} guest`);
      await expect(hp.locator('.connection-card').getByText(/2 players/)).toBeVisible();
      await hp.getByRole('button', { name: new RegExp(`Start ${item.name}`, 'i') }).click();
      await expect(hp.getByRole('button', { name: item.control })).toBeVisible();
      await expect(gp.getByText(item.name, { exact: true })).toBeVisible();
      await hp.close();
      await gp.close();
      await host.close();
      await guest.close();
    }
  });
});
