import { expect, type Locator, type Page } from '@playwright/test';
import { openPreviewBuilder, previewSheet } from './checklist-preview.js';

export async function openFormattingEditor(page: Page, locale = 'ru', adjust?: (sheet: ReturnType<typeof previewSheet>) => void) {
  const sheet = previewSheet();
  sheet.description = 'Важный текст'; sheet.scoringMode = 'scale'; sheet.feedbackEnabled = false; sheet.contextFields = []; sheet.itemGroups = [];
  sheet.scaleLevels = [{ level: 1, label: 'Нет', points: 0, description: 'Нужна практика' }, { level: 2, label: 'Да', points: 1, description: 'Готов к работе' }];
  sheet.items = sheet.items.slice(0, 1).map((item) => ({ ...item, scale: null, scaleId: null, groupId: null, photoRequired: false, descriptionEnabled: true, description: 'Проверьте маркировку' }));
  adjust?.(sheet);
  await openPreviewBuilder(page, sheet, locale);
  const editor = page.locator('#checklist-description[contenteditable="true"]');
  await expect(editor).toBeVisible();
  let saved: Record<string, unknown> | undefined;
  await page.route(`**/api/v1/checklists/${sheet.id}`, (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    saved = route.request().postDataJSON(); Object.assign(sheet, saved); return route.fulfill({ json: sheet });
  });
  return { sheet, editor, saved: () => saved };
}

export async function selectDescription(editor: Locator) {
  await editor.focus();
  const point = await editor.evaluate((element) => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
    const target = document.createRange(); target.selectNodeContents(text);
    const rect = target.getBoundingClientRect(); return { x: rect.x + Math.min(rect.width / 2, 25), y: rect.y + rect.height / 2 };
  });
  await editor.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  return point;
}

export async function openFormattingPopup(page: Page) {
  const data = await openFormattingEditor(page);
  const point = await selectDescription(data.editor);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const popup = page.getByRole('dialog', { name: 'Форматирование текста', exact: true });
  await expect(popup).toBeVisible(); await expect(popup).toHaveCSS('opacity', '1'); return { ...data, popup };
}

export async function openFormattedReport(page: Page) {
  const { installCriterionScaleMocks } = await import('./criterion-scales.js');
  const { sessionReportFixture } = await import('./session-report.js');
  const data = await installCriterionScaleMocks(page, 'instructor');
  data.session.status = 'completed';
  const report = sessionReportFixture(data.session);
  report.checklist.description = '<p style="text-align:center"><strong>Важный текст</strong><script>bad()</script></p>';
  report.criteria[0]!.description = '<p><em>Проверить маркировку</em></p>';
  await page.route('**/api/v1/checklist-sessions/scale-session**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/report')) return route.fulfill({ json: report });
    if (path.endsWith('/events') || path.endsWith('/location-captures') || path.endsWith('/score-revisions')) return route.fulfill({ json: [] });
    return route.fulfill({ json: data.session });
  });
  await page.goto('/instructor/checklists/sessions/all/scale-session');
  await expect(page.getByText('Важный текст', { exact: true })).toBeVisible();
}
