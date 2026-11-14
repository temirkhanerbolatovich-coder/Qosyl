import { expect, test } from '@playwright/test';

test('primary and secondary actions show hover, focus, active and disabled states', async ({
  page,
}) => {
  // "Сбросить" appears once something is applied, so the page opens with a filter.
  await page.goto('/opportunities?workMode=remote');
  const primary = page.getByRole('button', { name: 'Найти возможности', exact: true });
  const secondary = page.getByRole('button', { name: 'Сбросить', exact: true });
  const disabled = page.getByRole('button', { name: 'Назад', exact: true });
  await expect(disabled).toBeDisabled();
  await expect(disabled).toHaveCSS('opacity', '1');
  for (const action of [primary, secondary]) {
    const initial = await action.evaluate((element) => getComputedStyle(element).backgroundColor);
    await action.hover();
    await expect
      .poll(() => action.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(initial);
    await action.focus();
    await expect(action).toBeFocused();
    await expect
      .poll(() => action.evaluate((element) => getComputedStyle(element).outlineStyle))
      .not.toBe('none');
    await page.mouse.down();
    await expect
      .poll(() => action.evaluate((element) => getComputedStyle(element).filter))
      .toContain('brightness');
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
  const menu = page.getByRole('button', { name: 'Открыть меню' });
  if (await menu.isVisible()) await menu.click();
  await expect(page.getByRole('link', { name: 'Возможности', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
