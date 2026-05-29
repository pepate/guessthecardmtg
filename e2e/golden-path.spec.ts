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

// Math.random is pinned to 0. The client shuffles the fetched pool before the
// store draws from it, so with this fixed POOL the deterministic target is
// always 'Counterspell' and the shuffled options are
// [Doom Blade, Serra Angel, Grizzly Bears, Counterspell] every round.
const TARGET = 'Counterspell';
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
// controllable) while leaving requestAnimationFrame AND setTimeout running in
// real time — so Framer Motion transitions complete and the auto-advance timers
// (1s after a correct guess, 2s after a miss) actually fire.
const START = new Date('2030-01-01T08:00:00');
const ROUND_START = new Date(START.getTime() + 3000);

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

// Move the fixed Date forward to simulate `ms` of elapsed game time.
async function elapse(page: Page, ms: number) {
  await page.clock.setFixedTime(new Date(ROUND_START.getTime() + ms));
}

async function startRound(page: Page) {
  await page.goto('/');
  await page.clock.setFixedTime(ROUND_START);
  await page.getByRole('button', { name: 'Beliebte Karten' }).click();
  await expect(page.getByTestId('card-image')).toBeVisible();
  await expect(page.getByTestId('name-option')).toHaveCount(4);
}

const idleOption = (page: Page, name: string) =>
  page.locator('[data-testid="name-option"][data-state="idle"]', { hasText: name });

test('staged reveal: art-only → color → type → mana → text over 15s', async ({ page }) => {
  await setup(page);
  await startRound(page);

  const img = page.getByTestId('card-image');

  await expect(img).toHaveAttribute('data-stage', '0');
  await expect(page.getByTestId('blur-type')).toBeVisible();

  await elapse(page, 3200);
  await expect(img).toHaveAttribute('data-stage', '1');
  await expect(page.getByTestId('blur-type')).toBeVisible();

  await elapse(page, 6400);
  await expect(img).toHaveAttribute('data-stage', '2');
  await expect(page.getByTestId('blur-type')).toHaveCount(0);
  await expect(page.getByTestId('blur-mana')).toBeVisible();

  await elapse(page, 9600);
  await expect(img).toHaveAttribute('data-stage', '3');
  await expect(page.getByTestId('blur-mana')).toHaveCount(0);
  await expect(page.getByTestId('blur-text')).toBeVisible();

  await elapse(page, 12800);
  await expect(img).toHaveAttribute('data-stage', '4');
  await expect(page.getByTestId('blur-text')).toHaveCount(0);
});

test('correct guess highlights the answer, shows a points snackbar, then auto-advances', async ({ page }) => {
  await setup(page);
  await startRound(page);

  await expect(page.getByTestId('round-progress')).toHaveText('1/15');
  await idleOption(page, TARGET).click();

  // No overlay — the chosen (correct) option turns green in place.
  await expect(
    page.locator('[data-testid="name-option"][data-state="correct"]', { hasText: TARGET }),
  ).toBeVisible();

  // Snackbar counts up to the full points (instant guess at t=0 → 1000).
  await expect(page.getByTestId('snackbar')).toBeVisible();
  await expect(page.getByTestId('snackbar-points')).toHaveText('1000');

  // Auto-advances to the next card (~1s) with no extra click.
  await expect(page.getByTestId('round-progress')).toHaveText('2/15', { timeout: 4000 });
});

test('a later correct guess scores fewer points (smooth decay)', async ({ page }) => {
  await setup(page);
  await startRound(page);

  await elapse(page, 9000);
  await idleOption(page, TARGET).click();

  // Linear decay 1000→100 over 15s → 460 at 9s.
  await expect(page.getByTestId('snackbar-points')).toHaveText('460');
});

test('wrong guess marks both answers, reveals the card, shows no snackbar, then auto-advances', async ({ page }) => {
  await setup(page);
  await startRound(page);

  await idleOption(page, 'Doom Blade').click();

  await expect(
    page.locator('[data-testid="name-option"][data-state="wrong"]', { hasText: 'Doom Blade' }),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="name-option"][data-state="correct"]', { hasText: TARGET }),
  ).toBeVisible();
  await expect(page.getByTestId('card-image')).toHaveAttribute('data-status', 'lost');
  await expect(page.getByTestId('snackbar')).toHaveCount(0);

  // Reveal lingers ~2s then auto-advances.
  await expect(page.getByTestId('round-progress')).toHaveText('2/15', { timeout: 5000 });
});

test('running out of time loses the round and auto-advances', async ({ page }) => {
  await setup(page);
  await startRound(page);

  await elapse(page, 16000);

  await expect(page.getByTestId('card-image')).toHaveAttribute('data-status', 'lost');
  await expect(
    page.locator('[data-testid="name-option"][data-state="correct"]', { hasText: TARGET }),
  ).toBeVisible();
  await expect(page.getByTestId('snackbar')).toHaveCount(0);
  await expect(page.getByTestId('round-progress')).toHaveText('2/15', { timeout: 5000 });
});

test('the game ends after 15 cards and records a highscore', async ({ page }) => {
  await setup(page);
  await startRound(page);

  for (let i = 0; i < 15; i++) {
    await page.clock.setFixedTime(ROUND_START);
    await idleOption(page, TARGET).click();
  }

  const over = page.getByTestId('gameover');
  await expect(over).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('final-correct')).toHaveText('15/15');
  await expect(page.getByTestId('highscore-entry').first()).toBeVisible();
});

test('start screen offers only the popular and all pools', async ({ page }) => {
  await setup(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Beliebte Karten' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alle Karten' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nach Set' })).toHaveCount(0);
});

test('error path: a pool with fewer cards than options shows the error screen', async ({ page }) => {
  await setup(page, POOL.slice(0, 3));
  await page.goto('/');
  await page.getByRole('button', { name: 'Beliebte Karten' }).click();

  await expect(page.getByText('Zu wenige Karten im gewählten Pool.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neue Karte' })).toBeVisible();
});
