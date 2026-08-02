import { test as base } from '@playwright/test';

type IsolatedFixtures = {
  isolatedUser: {
    email: string;
    externalId: string;
  };
  isolatedCourse: {
    slug: string;
    title: string;
  };
};

function testSlug(browserName: string, workerIndex: number, testId: string) {
  return `${browserName}-${workerIndex}-${testId}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export const test = base.extend<IsolatedFixtures>({
  isolatedUser: async ({ browserName }, use, testInfo) => {
    const slug = testSlug(browserName, testInfo.workerIndex, testInfo.testId);

    await use({
      email: `e2e+${slug}@example.invalid`,
      externalId: `e2e-${slug}`,
    });
  },
  isolatedCourse: async ({ browserName }, use, testInfo) => {
    const slug = `e2e-${testSlug(browserName, testInfo.workerIndex, testInfo.testId)}`;
    await use({ slug, title: `E2E course ${slug}` });
  },
});

export { expect } from '@playwright/test';
