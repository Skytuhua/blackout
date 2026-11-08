import { expect, test, type Page } from '@playwright/test';

const speedControl = (page: Page) => page.getByRole('combobox', { name: 'Simulation speed', exact: true });
const header = (page: Page) => page.locator('.conv-header:visible, .conv-compact-toolbar:visible');

async function startPractice(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(header(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
}

async function sample(page: Page) {
  return header(page).locator('time').evaluate(element => {
    const [minutes, seconds] = element.textContent!.split(':').map(Number);
    const progress = document.querySelector('.conv-assignment [role=progressbar]');
    return { seconds: minutes * 60 + seconds, wallMs: performance.now(), progress: Number(progress?.getAttribute('aria-valuenow')) };
  });
}

test.beforeEach(async ({ page }) => {
  // Keep real simulation workers; block the external model boundary only.
  await page.route('**/api/llm/**', route => route.abort());
});

test('persistent header exposes a labeled simulation speed control', async ({ page }) => {
  await startPractice(page);
  await expect(speedControl(page)).toBeVisible();
  await expect(speedControl(page).locator('..')).toContainText('Speed');
  await expect(speedControl(page)).toHaveValue('1');
  await expect(speedControl(page).getByRole('option')).toHaveText(['1×', '2×', '4×']);
});

for (const speed of [1, 2, 4]) test(`header ${speed}x advances real worker time and inspection work at that rate`, async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await startPractice(page);
  await header(page).getByRole('button', { name: 'Pause', exact: true }).click();
  await speedControl(page).selectOption(String(speed));
  await page.getByRole('button', { name: 'Check cooling controls', exact: true }).click();
  const progress = page.getByRole('progressbar', { name: 'Alex task progress', exact: true });
  await expect(progress).toHaveAttribute('aria-valuetext', /Walking/);
  await header(page).getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(progress).toHaveAttribute('aria-valuetext', /Checking/, { timeout: 30_000 });
  const before = await sample(page);
  await page.waitForTimeout(3_200);
  const after = await sample(page);
  const simSeconds = after.seconds - before.seconds, wallSeconds = (after.wallMs - before.wallMs) / 1000;
  await testInfo.attach('real-worker-rate', { body: JSON.stringify({ speed, before, after, simSeconds, wallSeconds }), contentType: 'application/json' });
  expect(Math.abs(simSeconds - wallSeconds * speed)).toBeLessThanOrEqual(1.25);
  expect(simSeconds).toBeGreaterThanOrEqual(speed * 2);
  await expect(progress).toHaveAttribute('aria-valuetext', /Checking/);
  // The authored inspection takes 30 simulated seconds after travel.
  expect(Math.abs(after.progress - before.progress - simSeconds * 100 / 30)).toBeLessThanOrEqual(4);
});

test('keyboard speed changes preserve manual pause, actor drafts, and Menu synchronization', async ({ page }) => {
  await startPractice(page);
  await header(page).getByRole('button', { name: 'Pause', exact: true }).click();
  const alex = page.getByRole('textbox', { name: 'Message Alex', exact: true });
  await alex.fill('Keep this cooling question');
  await page.getByRole('tab', { name: 'Sam · IT', exact: true }).click();
  const sam = page.getByRole('textbox', { name: 'Message Sam', exact: true });
  await sam.fill('Keep this IT question');
  const before = await sample(page);
  await speedControl(page).focus();
  await speedControl(page).press('ArrowDown');
  await expect(speedControl(page)).toHaveValue('2');
  await speedControl(page).press('ArrowDown');
  await expect(speedControl(page)).toHaveValue('4');
  await expect(speedControl(page)).toBeFocused();
  await speedControl(page).press('Tab');
  await expect(header(page).getByRole('button', { name: 'Resume', exact: true })).toBeFocused();
  await page.waitForTimeout(1_200);
  expect((await sample(page)).seconds).toBe(before.seconds);
  await expect(sam).toHaveValue('Keep this IT question');
  await header(page).getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Game options', exact: true }).click();
  const menu = page.getByRole('dialog');
  await expect(menu.getByRole('button', { name: '4×', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await menu.getByRole('button', { name: '2×', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(speedControl(page)).toHaveValue('2');
  await expect(header(page).getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await page.waitForTimeout(1_200);
  expect((await sample(page)).seconds).toBe(before.seconds);
  await page.getByRole('tab', { name: 'Alex · Cooling', exact: true }).click();
  await expect(alex).toHaveValue('Keep this cooling question');
});

test('changing speed during guidance pause does not restart the real worker', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/llm/turn', async route => {
    const input = route.request().postDataJSON();
    await gate;
    await route.fulfill({ json: { kind: 'fallback', runId: input.runId, requestId: input.requestId, actorId: input.actorId, mode: 'scripted', reason: 'call_timeout', message: 'Timeout.', facts: [] } });
  });
  try {
    await startPractice(page);
    await page.getByRole('textbox', { name: 'Message Alex', exact: true }).fill('What should I check?');
    await page.getByRole('button', { name: 'Send to Alex', exact: true }).click();
    await expect(page.locator('.conv-assignment [role=status]')).toBeVisible();
    await expect(header(page).getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    const before = await sample(page);
    for (const speed of ['4', '2', '1']) {
      await speedControl(page).selectOption(speed);
      await page.waitForTimeout(600);
      expect((await sample(page)).seconds).toBe(before.seconds);
      await expect(header(page).getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    }
    release();
    await expect(page.locator('.conv-assignment [role=status]')).toHaveCount(0);
    await expect(header(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  } finally { release(); }
});

for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [640, 360]]) {
  for (const enlarged of width > 1000 ? [false, true] : [false]) test(`speed and essential controls fit ${width}x${height}${enlarged ? ' with enlarged text and widest sidebar' : ''}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await startPractice(page);
    await header(page).getByRole('button', { name: 'Pause', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    if (enlarged) {
      await page.addStyleTag({ content: '.conv-game { font-size:20px; } .conv-game button, .conv-game select, .conv-composer textarea { font-size:20px; }' });
      await page.getByRole('separator', { name: 'Resize conversation sidebar', exact: true }).press('End');
    }
    const checkToolbar = async () => {
      await expect(speedControl(page)).toBeVisible();
      await speedControl(page).selectOption('4');
      await expect(header(page).locator('time')).toBeVisible();
      const clipped = await header(page).locator('h1, time, label, select, button:visible').evaluateAll(elements => elements.filter(element => {
        const rect = element.getBoundingClientRect(), parent = element.closest('header, .conv-compact-toolbar')!.getBoundingClientRect();
        return rect.width <= 0 || rect.left < parent.left || rect.right > parent.right + 1 || rect.top < parent.top || rect.bottom > parent.bottom + 1;
      }).map(element => element.textContent));
      expect(clipped).toEqual([]);
      expect(await header(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1)).toBe(true);
      await header(page).getByRole('button', { name: 'Menu', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await header(page).getByRole('button', { name: 'Resume', exact: true }).click();
      await header(page).getByRole('button', { name: 'Pause', exact: true }).click();
    };
    await checkToolbar();
    const composer = page.getByRole('textbox', { name: 'Message Alex', exact: true });
    await composer.click();
    await expect(composer).toBeFocused();
    await expect(composer).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Send to Alex', exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([width, height]);
    await testInfo.attach('layout', { body: await page.screenshot(), contentType: 'image/png' });
    if (width === 640) {
      await page.getByRole('button', { name: 'World', exact: true }).click();
      await checkToolbar();
      await page.getByRole('button', { name: 'Conversation', exact: true }).click();
      await expect(speedControl(page)).toHaveValue('4');
      await expect(composer).toBeVisible();
    }
  });
}
