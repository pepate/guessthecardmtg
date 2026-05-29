import { test, expect, type Page } from '@playwright/test';

// 1x1 transparent PNG — every Scryfall image request is fulfilled with this so
// the R3F TextureLoader (crossOrigin) succeeds in headless Chromium.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const IMG = 'https://cards.scryfall.io/art_crop/x.png';

function card(
  name: string,
  colors: string[],
  cmc: number,
  type_line: string,
  power?: string,
) {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    cmc,
    colors,
    color_identity: colors,
    type_line,
    power,
    rarity: 'common',
    set: 'tst',
    set_name: 'Test Set',
    image_uris: { art_crop: IMG, normal: IMG },
  };
}

// pool[0] is always the target because Math.random is pinned to 0 below.
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

async function mockScryfall(page: Page, cards = POOL) {
  // Pin RNG so the drawn target and shuffles are deterministic.
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

test('golden path: pick pool, reveal an attribute, guess the name and win', async ({ page }) => {
  await mockScryfall(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Beliebte Karten' }).click();

  // Round is live once the name prompt shows.
  await expect(page.getByText('Wie heißt die Karte?')).toBeVisible();

  // Lightning Bolt has color, mana value and type → three hidden chips.
  await expect(page.getByText('???')).toHaveCount(3);

  // Card image renders grayscale (color not yet revealed).
  await expect(page.getByTestId('card-image')).toBeVisible();
  await expect(page.getByTestId('card-image')).toHaveAttribute('data-color-revealed', 'false');

  // Mana and type regions are blurred; Lightning Bolt has no power region.
  await expect(page.getByTestId('blur-mana')).toBeVisible();
  await expect(page.getByTestId('blur-type')).toBeVisible();
  await expect(page.getByTestId('blur-power')).toHaveCount(0);

  // Color tab is selected by default; R is correct for Lightning Bolt.
  await page.getByRole('button', { name: 'R', exact: true }).click();
  await page.getByRole('button', { name: 'Raten' }).click();

  // Color is now revealed → one fewer hidden chip.
  await expect(page.getByText('???')).toHaveCount(2);

  // Card image is now in full color.
  await expect(page.getByTestId('card-image')).toHaveAttribute('data-color-revealed', 'true');

  await page.getByRole('button', { name: 'Lightning Bolt' }).click();

  await expect(page.getByText('Richtig!')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nächste Karte' })).toBeVisible();
});

test('wrong name keeps the round going, then a correct guess wins', async ({ page }) => {
  await mockScryfall(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Beliebte Karten' }).click();
  await expect(page.getByText('Wie heißt die Karte?')).toBeVisible();

  await page.getByRole('button', { name: 'Counterspell' }).click();

  // Still playing — no win screen yet.
  await expect(page.getByText('Richtig!')).toHaveCount(0);
  await expect(page.getByText('Wie heißt die Karte?')).toBeVisible();

  await page.getByRole('button', { name: 'Lightning Bolt' }).click();
  await expect(page.getByText('Richtig!')).toBeVisible();
});

test('error path: a pool with too few cards shows the error screen', async ({ page }) => {
  await mockScryfall(page, [POOL[0]]);
  await page.goto('/');

  await page.getByRole('button', { name: 'Beliebte Karten' }).click();

  await expect(page.getByText('Zu wenige Karten im gewählten Pool.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neue Karte' })).toBeVisible();
});
