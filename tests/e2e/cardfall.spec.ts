import { test, expect, chromium, type Browser, type Page } from '@playwright/test';

async function chooseCardfall(page:Page,name:string){await page.getByText('Cardfall',{exact:true}).click();await page.getByPlaceholder('e.g. Alex').fill(name);}
async function createTable(page:Page){await page.getByRole('button',{name:/Create Cardfall table/i}).click();await expect(page.locator('.mode')).toContainText('ROOM');}

test.describe('Cardfall guest multiplayer',()=>{
 let browser:Browser;
 test.beforeAll(async()=>{browser=await chromium.launch({headless:true});});
 test.afterAll(async()=>{await browser.close();});
 test('two guests can join, see the turn rail, chat, and synchronize a game',async()=>{
  const host=await browser.newContext();const guest=await browser.newContext();const hp=await host.newPage();const gp=await guest.newPage();
  await hp.goto('/');await chooseCardfall(hp,'Host');await createTable(hp);
  const room=await hp.locator('.invite-code').innerText();expect(room).toMatch(/^[A-Z0-9-]{3,12}$/);
  await gp.goto('/');await gp.getByPlaceholder('e.g. Alex').fill('Guest');await gp.getByPlaceholder('HAVE A ROOM CODE?').fill(room);await gp.getByRole('button',{name:'Join table'}).click();
  await expect(hp.locator('.turn-player').filter({hasText:'Guest'})).toBeVisible();await expect(gp.locator('.turn-player').filter({hasText:'Host'})).toBeVisible();
  await expect(hp.getByText(/TURN ORDER/)).toBeVisible();await expect(gp.getByText(/TABLE CHAT/)).toBeVisible();
  await expect(hp.getByText(/Need one more player|Deal the cards/)).toBeVisible();
  const deal=hp.getByRole('button',{name:'Deal the cards'});await expect(deal).toBeEnabled();await deal.click();
  await expect(hp.getByRole('heading',{name:'Host is playing'})).toBeVisible();await expect(gp.getByRole('heading',{name:'Host is playing'})).toBeVisible();
  const chat=hp.getByPlaceholder('Send a message to the table…');await chat.fill('hello from host');await chat.press('Enter');await expect(hp.getByText('Host: hello from host')).toBeVisible();await expect(gp.getByText('Host: hello from host')).toBeVisible();
  await hp.screenshot({path:'test-results/cardfall-host.png',fullPage:true});await gp.screenshot({path:'test-results/cardfall-guest.png',fullPage:true});
  await hp.close();await gp.close();await host.close();await guest.close();
 });
 test('lobby exposes all supported games and game-specific settings',async()=>{const page=await browser.newPage();await page.goto('/');for(const game of ['Cardfall','Blackjack','Texas Hold’em','Solitaire','High Card Duel'])await expect(page.getByText(game,{exact:true})).toBeVisible();await page.getByText('Blackjack',{exact:true}).click();await expect(page.getByText('Dealer on soft 17')).toBeVisible();await page.getByText('Solitaire',{exact:true}).click();await expect(page.getByText('Variant')).toBeVisible();await page.close();});
 test('mobile layout keeps the setup actions reachable',async()=>{const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true});const page=await context.newPage();await page.goto('/');await expect(page.getByRole('button',{name:/Create Cardfall table/i})).toBeVisible();await expect(page.getByRole('button',{name:'Join table'})).toBeVisible();await page.screenshot({path:'test-results/mobile-lobby.png',fullPage:true});await context.close();});
});
