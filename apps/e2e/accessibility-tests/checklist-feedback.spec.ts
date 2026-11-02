import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { answerSetServer, openFeedbackBuilder, openFeedbackConduct } from '../fixtures/checklist-feedback.js';

for (const screen of ['builder', 'answer-set', 'conduct'] as const) test(`configurable feedback ${screen} meets WCAG on a narrow screen`, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  if (screen === 'builder') await openFeedbackBuilder(page);
  else if (screen === 'answer-set') await answerSetServer().attach(page, '/readiness');
  else await openFeedbackConduct(page);
  const audit = new AxeBuilder({ page });
  if (screen === 'builder') audit.include('.admin-feedback-block');
  const result = await audit.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
