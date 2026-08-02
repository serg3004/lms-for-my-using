import { Toolbar } from '../../shared/ui.js';
import { EMPTY_USER_FILTERS, USER_ROLES, USER_STATUSES, type AdminUsersFilters as Filters } from './model.js';

export function AdminUsersFilters({ filters, onChange }: { filters: Filters; onChange: (filters: Filters) => void }) {
  return <Toolbar className="admin-users-filters" left={<>
    <label className="admin-users-filter"><span>Search users</span><input type="search" value={filters.query} onChange={(e) => onChange({ ...filters, query: e.target.value })} /></label>
    <label className="admin-users-filter"><span>Role</span><select value={filters.role} onChange={(e) => onChange({ ...filters, role: e.target.value as Filters['role'] })}><option value="">All roles</option>{USER_ROLES.map((role) => <option key={role}>{role}</option>)}</select></label>
    <label className="admin-users-filter"><span>Status</span><select value={filters.status} onChange={(e) => onChange({ ...filters, status: e.target.value as Filters['status'] })}><option value="">All statuses</option>{USER_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
  </>} right={<button className="admin-btn admin-btn--secondary" disabled={!filters.query && !filters.role && !filters.status} onClick={() => onChange(EMPTY_USER_FILTERS)} type="button">Clear filters</button>} />;
}
