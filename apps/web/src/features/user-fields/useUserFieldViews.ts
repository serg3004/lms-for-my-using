import { useEffect, useState } from 'react';

import { getUserFieldsForUsers, getVisibleUserFields, type UserFieldView } from '../../shared/api/userFields.js';

/**
 * PR 500: the custom fields the caller may see, for a form, a list or an import: `users` is the staff view of other people,
 * `own` the person's view of themselves. A failed load means "no custom fields": the standard form still works.
 */
export function useUserFieldViews(source: 'users' | 'own'): { fields: UserFieldView[]; loaded: boolean } {
  const [state, setState] = useState<{ fields: UserFieldView[]; loaded: boolean }>({ fields: [], loaded: false });
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => (source === 'users' ? getUserFieldsForUsers() : getVisibleUserFields()))
      .then((result) => { if (active) setState({ fields: result.items, loaded: true }); })
      .catch(() => { if (active) setState({ fields: [], loaded: true }); });
    return () => { active = false; };
  }, [source]);
  return state;
}
