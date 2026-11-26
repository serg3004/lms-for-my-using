import { useEffect, useState } from 'react';

import { getChecklistInputPolicy } from './api/voicePolicy.js';

/**
 * PR 512: dictation for the text fields that have no checklist of their own (reasons, the assessment reviewer's comment).
 * It follows the organization's switch; until the server answers, or when this role cannot read it, dictation is offered.
 */
export function useOrgDictation(): boolean {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => getChecklistInputPolicy())
      .then((policy) => { if (active && policy && typeof policy.dictationEnabled === 'boolean') setEnabled(policy.dictationEnabled); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return enabled;
}
