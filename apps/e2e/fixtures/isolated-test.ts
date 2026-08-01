import { test as base } from '@playwright/test';

type IsolatedFixtures = {
  isolatedUser: {
    email: string;
    externalId: string;
  };
};

export const test = base.extend<IsolatedFixtures>({
  isolatedUser: async ({ browserName }, use, testInfo) => {
    const slug = `${browserName}-${testInfo.workerIndex}-${testInfo.testId}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);

    await use({
      email: `e2e+${slug}@example.invalid`,
      externalId: `e2e-${slug}`,
    });
  },
});

export { expect } from '@playwright/test';
