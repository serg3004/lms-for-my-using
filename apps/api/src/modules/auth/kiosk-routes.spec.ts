import { endsKioskSession, isKioskRoute } from './kiosk-routes.js';

const id = '3f2c1a9e-7b44-4c1d-9a55-0e6d2b1f8c10';
const other = 'a1b2c3d4-0000-4000-8000-000000000001';

describe('kiosk routes', () => {
  it.each([
    ['GET', '/learner-dashboard'], ['GET', '/assignments'], ['GET', `/assignments/${id}`], ['GET', '/checklist-instances/mine'],
    ['PATCH', `/checklist-instances/${id}/items/${other}`], ['POST', `/checklist-instances/${id}/finish`], ['GET', '/checklist-sessions/to-conduct'],
    ['GET', `/checklist-sessions/${id}/conduct`], ['POST', `/checklist-sessions/${id}/complete`], ['POST', `/checklist-sessions/${id}/location/start`],
    ['POST', `/assessments/${id}/attempts/start`], ['POST', `/assessments/${id}/attempts`], ['GET', `/attempts/${id}/result`],
    ['GET', `/courses/${id}/lessons`], ['GET', `/lessons/${id}`], ['GET', '/progress'], ['POST', '/progress'],
    ['GET', '/api/v1/learner-dashboard'], ['GET', '/learner-dashboard/'],
  ])('opens %s %s', (method, path) => {
    expect(isKioskRoute(method, path)).toBe(true);
  });

  it.each([
    ['GET', '/users'], ['GET', '/certificates'], ['GET', '/memberships'], ['GET', '/notifications'], ['GET', '/audit-log'],
    ['GET', '/checklists/analytics'], ['GET', '/checklists/free'], ['GET', '/checklists/workplace-settings'], ['POST', '/checklists/free'],
    ['POST', `/checklists/${id}/start`], ['GET', '/checklist-sessions'], ['GET', `/checklist-sessions/${id}/report`], ['DELETE', `/checklist-sessions/${id}`],
    ['POST', `/checklist-sessions/${id}/cancel`], ['PATCH', `/checklist-instances/${id}/reviewer`], ['POST', `/checklist-instances/${id}/transfer`],
    ['GET', `/assessments/${id}/results`], ['GET', `/assessments/${id}/report`], ['POST', `/assessments/${id}/attempts/preview`],
    ['POST', '/courses'], ['PATCH', `/courses/${id}`], ['GET', `/lessons/${id}/longread`], ['PUT', `/lessons/${id}/longread`],
    ['GET', '/learner-dashboard/extra'], ['DELETE', '/learner-dashboard'], ['GET', '/auth/me/sessions'], ['POST', '/users/badges'],
    ['GET', `/organizations/${id}/badge`], ['GET', '/learner-dashboard/../users'], ['GET', '/progress/summary/../x'],
  ])('closes %s %s', (method, path) => {
    expect(isKioskRoute(method, path)).toBe(false);
  });

  it('closes everything when the method or the path is missing', () => {
    expect(isKioskRoute(undefined, '/learner-dashboard')).toBe(false);
    expect(isKioskRoute('GET', undefined)).toBe(false);
  });

  it('knows which calls end the work of a kiosk session', () => {
    expect(endsKioskSession('POST', `/api/v1/checklist-instances/${id}/finish`)).toBe(true);
    expect(endsKioskSession('POST', `/checklist-sessions/${id}/complete`)).toBe(true);
    expect(endsKioskSession('POST', `/assessments/${id}/attempts`)).toBe(true);
    expect(endsKioskSession('POST', `/assessments/${id}/attempts/start`)).toBe(false);
    expect(endsKioskSession('GET', `/checklist-instances/${id}/finish`)).toBe(false);
  });
});
