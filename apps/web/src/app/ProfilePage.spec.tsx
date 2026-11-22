import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ roles: ['learner'] as string[] }));

vi.mock('../shared/session.js', () => ({
  useSession: () => ({ currentUser: { id: 'u1', firstName: 'A', lastName: 'B', roles: session.roles } }),
}));
vi.mock('./LearnerProfilePage.js', () => ({ LearnerProfilePage: () => <p>profile-content</p> }));
vi.mock('../shared/adminPage.js', () => ({ AdminPageLayout: ({ children }: { children: unknown }) => <div data-frame="admin">{children as never}</div> }));
vi.mock('../shared/managerLayout.js', () => ({ ManagerPageLayout: ({ children }: { children: unknown }) => <div data-frame="manager">{children as never}</div> }));
vi.mock('../shared/instructorLayout.js', () => ({ InstructorPageLayout: ({ children }: { children: unknown }) => <div data-frame="instructor">{children as never}</div> }));
vi.mock('../shared/mentorLayout.js', () => ({ MentorPageLayout: ({ children }: { children: unknown }) => <div data-frame="mentor">{children as never}</div> }));
vi.mock('../shared/learnerLayout.js', () => ({ LearnerPageLayout: ({ children }: { children: unknown }) => <div data-frame="learner">{children as never}</div> }));

import { ProfilePage } from './ProfilePage.js';

function frameFor(roles: string[]) {
  session.roles = roles;
  const html = renderToStaticMarkup(<MemoryRouter><ProfilePage /></MemoryRouter>);
  expect(html).toContain('profile-content');
  return /data-frame="(\w+)"/.exec(html)?.[1];
}

describe('ProfilePage', () => {
  it('uses the frame of the main role and shows the same content to everyone', () => {
    expect(frameFor(['learner'])).toBe('learner');
    expect(frameFor(['mentor'])).toBe('mentor');
    expect(frameFor(['instructor'])).toBe('instructor');
    expect(frameFor(['manager', 'instructor'])).toBe('manager');
    expect(frameFor(['admin', 'manager'])).toBe('admin');
  });
});
