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
    await expect(gp.getByRole('button', { name: 'No' })).toBeVisible();
    await gp.getByRole('button', { name: 'Yes' }).click();
    await expect(hp.getByRole('heading', { name: 'Host is playing' })).toBeVisible();

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
