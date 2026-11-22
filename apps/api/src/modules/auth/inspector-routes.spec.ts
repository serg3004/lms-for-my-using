import { isInspectorRoute } from './inspector-routes.js';

describe('inspector routes', () => {
  it.each([['POST', '/employee-card/open'], ['POST', '/api/v1/employee-card/photo'], ['POST', '/employee-card/checked/']])('opens %s %s', (method, path) => {
    expect(isInspectorRoute(method, path)).toBe(true);
  });

  it.each([['GET', '/employee-card/open'], ['POST', '/employee-card/views'], ['GET', '/assignments'], ['POST', '/employee-card/open/extra'], ['DELETE', '/users/inspectors/x']])('closes %s %s', (method, path) => {
    expect(isInspectorRoute(method, path)).toBe(false);
  });

  it('treats a missing method as GET', () => {
    expect(isInspectorRoute(undefined, '/employee-card/open')).toBe(false);
  });
});
