import type { CSSProperties } from 'react';

/**
 * PR 443: a checkbox or radio with its caption. The control keeps its own size and sits right before the text; a caption of
 * several lines starts level with the control (the top line), the row is at least 44 px high for touch.
 */
export const CHECK_ROW: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44, boxSizing: 'border-box', paddingBlock: 10, cursor: 'pointer' };
/** 18 px box; the 3 px top margin centres it on the first 24 px line of the caption. */
export const CHECK_BOX: CSSProperties = { width: 18, height: 18, flex: 'none', margin: '3px 0 0', padding: 0, minHeight: 0 };
