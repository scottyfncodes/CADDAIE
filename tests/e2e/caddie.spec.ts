import { expect, test, type Page } from '@playwright/test';

const API = 'https://caddaie-api.test';

async function withProfile(page: Page, patch: Record<string, unknown> = {}) {
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.setItem('caddaie.profile', JSON.stringify(p));
      sessionStorage.setItem('__seeded', '1');
    }
  }, { aiEndpoint: API, ...patch });
}

test.describe('first load', () => {
  test('brands the app and asks only for distance', async ({ page }) => {
    await page.goto('./');
    await expect(page).toHaveTitle(/CADDAIE/);
    await expect(page.getByRole('img', { name: 'CADDAIE' })).toBeVisible();
    await expect(page.getByTestId('recommendation')).toContainText('How far to the target?');
    await expect(page.getByTestId('club')).toHaveCount(0);
  });

  test('has PWA and iOS metadata', async ({ page, request }) => {
    await page.goto('./');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', './manifest.webmanifest');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    const manifest = await (await request.get('manifest.webmanifest')).json();
    expect(manifest.short_name).toBe('CADDAIE');
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
    expect((await request.get('icons/apple-touch-icon.png')).ok()).toBe(true);
  });
});

test.describe('primary caddie flow', () => {
  test('distance → club, plays-like and reasoning', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('152');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
    await expect(page.getByTestId('swing')).toHaveText('Full swing');
    await expect(page.getByTestId('plays-like')).toContainText('152');
    await expect(page.getByTestId('recommendation')).toBeInViewport();
  });

  test('wind and elevation change the club, and the math adds up on screen', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('150');
    await page.getByRole('radio', { name: 'Into your face' }).click();
    await page.getByRole('group', { name: 'Wind speed' }).getByRole('button', { name: 'Increase Wind speed' }).click();
    await page.getByRole('radiogroup', { name: 'Quick wind speed' }).getByRole('radio', { name: '10' }).click();
    await page.getByRole('button', { name: 'Increase Elevation change' }).click();
    await expect(page.getByTestId('math')).toContainText('10 mph into');
    await expect(page.getByTestId('math')).toContainText('5 ft uphill');
    const total = Number((await page.getByTestId('plays-like').innerText()).match(/\d+/)![0]);
    expect(total).toBe(167);
    await expect(page.getByTestId('club')).not.toHaveText('7 Iron');
  });

  test('steppers work without typing', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Plus 5' }).click();
    await expect(page.getByRole('textbox', { name: /Distance to target/ })).toHaveValue('155');
    await page.getByRole('button', { name: 'Minus 1' }).click();
    await expect(page.getByRole('textbox', { name: /Distance to target/ })).toHaveValue('154');
    await expect(page.getByTestId('club')).toBeVisible();
  });

  test('trouble changes strategy', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('154');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
    await page.getByRole('button', { name: 'Short', exact: true }).click();
    await expect(page.getByTestId('club')).toHaveText('6 Iron');
    await page.getByRole('button', { name: 'Left', exact: true }).click();
    await expect(page.getByTestId('aim')).toContainText('R');
  });

  test('invalid distance explains itself instead of guessing', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('900');
    await expect(page.getByTestId('recommendation')).toContainText('between 1 and 700');
    await expect(page.getByTestId('club')).toHaveCount(0);
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('');
    await expect(page.getByTestId('recommendation')).toContainText('How far to the target?');
  });

  test('new shot keeps conditions but clears the shot', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('140');
    await page.getByRole('radiogroup', { name: 'Quick wind speed' }).getByRole('radio', { name: '10' }).click();
    await page.getByRole('radio', { name: 'Rough', exact: true }).click();
    await page.getByTestId('new-shot').click();
    await expect(page.getByRole('textbox', { name: /Distance to target/ })).toHaveValue('');
    await expect(page.getByRole('radio', { name: 'Fairway' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('group', { name: 'Wind speed' })).toContainText('10 mph');
  });
});

test.describe('settings and persistence', () => {
  test('editing a carry changes the recommendation and persists across reloads', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('158');
    await expect(page.getByTestId('club')).toHaveText('6 Iron');
    await page.getByTestId('open-settings').click();
    await page.getByLabel('7 Iron carry in yds').fill('158');
    await page.getByTestId('close-settings').click();
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
    await page.reload();
    await expect(page.getByRole('textbox', { name: /Distance to target/ })).toHaveValue('158');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
  });

  test('metric units', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('open-settings').click();
    await page.getByRole('radio', { name: /Meters/ }).click();
    await page.getByTestId('close-settings').click();
    await page.getByRole('textbox', { name: /Distance to target in m/ }).fill('139');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
    await expect(page.getByTestId('plays-like')).toContainText('m');
  });

  test('removing every club asks for clubs instead of breaking', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('open-settings').click();
    for (const box of await page.getByTestId('bag').getByRole('checkbox').all()) await box.uncheck();
    await page.getByTestId('close-settings').click();
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('150');
    await expect(page.getByTestId('recommendation')).toContainText('Add at least one club');
  });

  test('corrupt storage falls back to defaults', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('caddaie.profile', '{broken');
      localStorage.setItem('caddaie.situation', '"nope"');
    });
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('152');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
  });
});

test.describe('AI layer', () => {
  test('without an endpoint, says so calmly and the caddie still works', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('150');
    await expect(page.getByText("The AI caddie isn't connected")).toBeVisible();
    await expect(page.getByTestId('ask-ai')).toHaveCount(0);
  });

  test('shows a validated AI take, and never changes the numbers', async ({ page }) => {
    await withProfile(page);
    let calls = 0;
    await page.route(`${API}/v1/take`, async (route) => {
      calls++;
      const brief = route.request().postDataJSON();
      expect(JSON.stringify(route.request().headers())).not.toMatch(/x-api-key|authorization/i);
      await route.fulfill({ json: { take: `${brief.decision.club}, ${brief.decision.swing.toLowerCase()}. Commit to it.`, concern: null } });
    });
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('152');
    await page.getByTestId('ask-ai').click();
    await expect(page.getByTestId('ai-output')).toContainText('7 Iron, full swing. Commit to it.');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
    // Change the situation: the stale take disappears…
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('140');
    await expect(page.getByTestId('ai-output')).not.toContainText('Commit to it.');
    // …and returning to the same situation is served from cache, with no second request.
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('152');
    await expect(page.getByTestId('ai-output')).toContainText('7 Iron, full swing. Commit to it.');
    expect(calls).toBe(1);
  });

  test('an AI answer that contradicts the math is discarded', async ({ page }) => {
    await withProfile(page);
    await page.route(`${API}/v1/take`, (route) => route.fulfill({ json: { take: 'Hit the 5 iron, it plays 175 yards.', concern: null } }));
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('152');
    await page.getByTestId('ask-ai').click();
    await expect(page.getByTestId('ai-output')).toContainText('disagreed with the math');
    await expect(page.getByTestId('ai-output')).not.toContainText('5 iron');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
  });

  test('proxy failure is explained in plain language', async ({ page }) => {
    await withProfile(page);
    await page.route(`${API}/v1/take`, (route) => route.fulfill({ status: 502, json: { error: 'ai_error' } }));
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('152');
    await page.getByTestId('ask-ai').click();
    await expect(page.getByTestId('ai-output')).toContainText('unavailable right now');
  });

  test('unreachable proxy does not hang', async ({ page }) => {
    await withProfile(page);
    await page.route(`${API}/v1/take`, (route) => route.abort('connectionrefused'));
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('152');
    await page.getByTestId('ask-ai').click();
    await expect(page.getByTestId('ai-output')).toContainText('unavailable');
    await expect(page.getByTestId('ask-ai')).toBeEnabled();
  });

  test('shows a loading state while thinking', async ({ page }) => {
    await withProfile(page);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(`${API}/v1/take`, async (route) => {
      await gate;
      await route.fulfill({ json: { take: '7 iron. Trust it.', concern: null } });
    });
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('152');
    await page.getByTestId('ask-ai').click();
    await expect(page.getByTestId('ask-ai')).toContainText('Thinking');
    await expect(page.getByTestId('ask-ai')).toBeDisabled();
    release();
    await expect(page.getByTestId('ai-output')).toContainText('Trust it.');
  });
});

test.describe('live conditions', () => {
  test('GPS denied keeps the manual path', async ({ page, context }) => {
    await context.clearPermissions();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: (_ok: unknown, err: (e: unknown) => void) => err({ code: 1 }) },
      });
    });
    await page.goto('./');
    await page.getByTestId('live-weather').click();
    await expect(page.getByTestId('live-error')).toContainText('Location is off');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('150');
    await expect(page.getByTestId('club')).toBeVisible();
  });

  test('weather service down keeps the manual path', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 39.74, longitude: -104.99 });
    await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 500, body: 'down' }));
    await page.goto('./');
    await page.getByTestId('live-weather').click();
    await expect(page.getByTestId('live-error')).toContainText('Weather service is unavailable');
  });

  test('live weather fills wind, then aiming direction places it', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 39.74, longitude: -104.99 });
    await page.route('https://api.open-meteo.com/**', (route) =>
      route.fulfill({ json: { elevation: 1609, current: { temperature_2m: 60, wind_speed_10m: 12, wind_direction_10m: 0, wind_gusts_10m: 14 } } }),
    );
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('150');
    await page.getByTestId('live-weather').click();
    await expect(page.getByTestId('live-ok')).toContainText('12 mph');
    await page.getByRole('radiogroup', { name: 'Direction you are hitting' }).getByRole('radio', { name: 'N', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Into your face' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('math')).toContainText('12 mph into');
    await expect(page.getByTestId('math')).toContainText('altitude');
  });
});

test.describe('offline', () => {
  test('works offline after first visit (service worker)', async ({ page, context }) => {
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('152');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
    await context.setOffline(false);
  });
});

test.describe('mobile layout', () => {
  test('no horizontal scroll and big touch targets', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('150');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const small = await page.$$eval('button', (els) =>
      els
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ t: e.textContent?.trim() || e.getAttribute('aria-label'), r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.height < 40 || r.width < 40)
        .map(({ t, r }) => `${t} ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    expect(small).toEqual([]);
  });

  test('the answer stays reachable after scrolling to inputs', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('./');
    await page.getByRole('textbox', { name: /Distance to target/ }).fill('150');
    await page.getByTestId('new-shot').scrollIntoViewIfNeeded();
    await page.getByRole('textbox', { name: /Distance to target/ }).evaluate(() => 0);
    await page.getByRole('button', { name: 'Short', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByTestId('mini')).toBeVisible();
    await expect(page.getByTestId('mini')).toContainText('7i');
  });
});
