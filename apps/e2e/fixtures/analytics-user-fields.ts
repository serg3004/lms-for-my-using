import type { Page } from '@playwright/test';

export async function installAnalyticsUserFieldMocks(page: Page) {
  const labels = { ru: 'График работы', en: 'Work schedule', kk: 'Жұмыс кестесі', zh: '工作时间表' };
  const optionLabels = { ru: 'Два через два', en: 'Two on, two off', kk: 'Екі күн жұмыс, екі күн демалыс', zh: '上二休二' };
  await page.route('**/api/v1/user-fields/for-users', (route) => route.fulfill({ json: { items: [
    {
      key: 'work_schedule', labels, type: 'list', required: false, unique: false, searchable: false, sortOrder: 0,
      options: [{ key: '2-2', labels: optionLabels }],
    },
  ] } }));
}
