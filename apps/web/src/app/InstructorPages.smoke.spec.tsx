import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactMocks = vi.hoisted(() => ({
  useEffect: vi.fn(),
  useState: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    useEffect: reactMocks.useEffect,
    useState: reactMocks.useState,
  };
});

import { InstructorCourseFormPage } from './InstructorCourseFormPage';
import { InstructorCourseStudentsPage } from './InstructorCourseStudentsPage';
import { InstructorCoursesPage } from './InstructorCoursesPage';
import { InstructorDashboardPage } from './InstructorDashboardPage';

function useLoadingState() {
  reactMocks.useState.mockImplementation((initialState: unknown) => [initialState, vi.fn()]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Instructor pages smoke tests', () => {
  it('InstructorDashboardPage renders without crashing in loading state', () => {
    useLoadingState();
    expect(() => renderToStaticMarkup(<InstructorDashboardPage />)).not.toThrow();
  });

  it('InstructorCoursesPage renders without crashing in loading state', () => {
    useLoadingState();
    expect(() =>
      renderToStaticMarkup(
        <MemoryRouter>
          <InstructorCoursesPage />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it('InstructorCourseFormPage create mode renders without crashing in loading state', () => {
    useLoadingState();
    expect(() =>
      renderToStaticMarkup(
        <MemoryRouter>
          <InstructorCourseFormPage mode="create" />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it('InstructorCourseStudentsPage renders without crashing in loading state', () => {
    useLoadingState();
    expect(() =>
      renderToStaticMarkup(
        <MemoryRouter>
          <InstructorCourseStudentsPage courseId="course-id-1" />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });
});
