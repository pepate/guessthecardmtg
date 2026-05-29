import { test, expect, type Page } from '@playwright/test';

// 1x1 transparent PNG so every Scryfall image request resolves in headless Chromium.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const IMG = 'https://cards.scryfall.io/normal/x.png';

function card(name: string, colors: string[], cmc: number, type_line: string, power?: string) {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    cmc,
    colors,
    color_identity: colors,
    type_line,
    power,
    rarity: 'rare',
    set: 'tst',
    set_name: 'Test Set',
    image_uris: { art_crop: IMG, normal: IMG },
  };
}

// pool[0] is always the target because Math.random is pinned to 0.
const POOL = [
  card('Lightning Bolt', ['R'], 1, 'Instant'),
  card('Counterspell', ['U'], 2, 'Instant'),
  card('Llanowar Elves', ['G'], 1, 'Creature — Elf Druid', '1'),
  card('Doom Blade', ['B'], 2, 'Instant'),
  card('Serra Angel', ['W'], 5, 'Creature — Angel', '4'),
  card('Grizzly Bears', ['G'], 2, 'Creature — Bear', '2'),
];

function listBody(cards: unknown[]) {
  return JSON.stringify({ object: 'list', has_more: false, data: cards });
}

// Strategy: install fake timers, then pin Date with setFixedTime. setFixedTime
// fixes Date.now()/new Date() (so game elapsed = fixedTime - startedAt is fully
// controllable) while leaving requestAnimationFrame running in real time — so
// Framer Motion's AnimatePresence exit/enter animations actually complete and
// the playing UI mounts. (pauseAt freezes rAF too, which deadlocks the exit
// animation and the name buttons never appear.) To advance game time, move the
// fixed Date forward; the next real-time rAF frame recomputes elapsed/stage.
const START = new Date('2030-01-01T08:00:00');

async function setup(page: Page, cards = POOL) {
  await page.clock.install({ time: START });
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.route('https://cards.scryfall.io/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: PNG_1x1,
    }),
  );
  await page.route('https://api.scryfall.com/cards/search**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: listBody(cards) }),
  );
}

// Round starts (and startedAt is captured) at exactly this fixed instant.
const ROUND_START = new Date(START.getTime() + 3000);

// Move the fixed Date forward to simulate `ms` of elapsed game time.
async function elapse(page: Page, ms: number) {
  await page.clock.setFixedTime(new Date(ROUND_START.getTime() + ms));
}

async function startRound(page: Page) {
  await page.goto('/');
  await page.clock.setFixedTime(ROUND_START);
  await page.getByRole('button', { name: 'Beliebte Karten' }).click();
  await expect(page.getByTestId('card-image')).toBeVisible();
  // Wait for the staged-reveal UI to mount (exit animation completes in realtime).
  await expect(page.getByTestId('name-option')).toHaveCount(4);
}

test('staged reveal: art-only → color → type → mana → text over 15s', async ({ page }) => {
  await setup(page);
  await startRound(page);

  const img = page.getByTestId('card-image');

  // Stage 0: artwork only. Name is masked/blurred; type still hidden.
  await expect(img).toHaveAttribute('data-stage', '0');
  await expect(page.getByTestId('blur-type')).toBeVisible();

  // Stage 1 (3.2s): full card in color, everything still blurred.
  await elapse(page, 3200);
  await expect(img).toHaveAttribute('data-stage', '1');
  await expect(page.getByTestId('blur-type')).toBeVisible();

  // Stage 2 (6.4s): type revealed.
  await elapse(page, 6400);
  await expect(img).toHaveAttribute('data-stage', '2');
  await expect(page.getByTestId('blur-type')).toHaveCount(0);
  await expect(page.getByTestId('blur-mana')).toBeVisible();

  // Stage 3 (9.6s): mana revealed.
  await elapse(page, 9600);
  await expect(img).toHaveAttribute('data-stage', '3');
  await expect(page.getByTestId('blur-mana')).toHaveCount(0);
  await expect(page.getByTestId('blur-text')).toBeVisible();

  // Stage 4 (12.8s): text revealed.
  await elapse(page, 12800);
  await expect(img).toHaveAttribute('data-stage', '4');
  await expect(page.getByTestId('blur-text')).toHaveCount(0);
});

test('correct guess wins and awards points; earlier guess scores more', async ({ page }) => {
  await setup(page);
  await startRound(page);

  // Guess immediately for the maximum score.
  await page.getByRole('button', { name: 'Lightning Bolt' }).click();

  const board = page.getByTestId('scoreboard');
  await expect(board).toBeVisible();
  await expect(board).toHaveAttribute('data-result', 'won');
  await expect(page.getByText('+1000 Punkte')).toBeVisible();
});

test('a later correct guess scores fewer points', async ({ page }) => {
  await setup(page);
  await startRound(page);

  await elapse(page, 9000);
  await page.getByRole('button', { name: 'Lightning Bolt' }).click();

  const board = page.getByTestId('scoreboard');
  await expect(board).toHaveAttribute('data-result', 'won');
  // Linear decay 1000→100 over 15s → 460 at 9s.
  await expect(page.getByText('+460 Punkte')).toBeVisible();
});

test('wrong guess locks the round as lost', async ({ page }) => {
  await setup(page);
  await startRound(page);

  await page.getByRole('button', { name: 'Doom Blade' }).click();

  const board = page.getByTestId('scoreboard');
  await expect(board).toHaveAttribute('data-result', 'lost');
  await expect(page.getByText('Lightning Bolt')).toBeVisible();
});

test('running out of time loses the round', async ({ page }) => {
  await setup(page);
  await startRound(page);

  // Past the 15s deadline so the next rAF frame fires the expiry.
  await elapse(page, 16000);

  const board = page.getByTestId('scoreboard');
  await expect(board).toHaveAttribute('data-result', 'lost');
  await expect(page.getByText('Zeit abgelaufen')).toBeVisible();
});

test('error path: a pool with fewer cards than options shows the error screen', async ({ page }) => {
  await setup(page, POOL.slice(0, 3));
  await page.goto('/');
  await page.getByRole('button', { name: 'Beliebte Karten' }).click();

  await expect(page.getByText('Zu wenige Karten im gewählten Pool.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neue Karte' })).toBeVisible();
});
