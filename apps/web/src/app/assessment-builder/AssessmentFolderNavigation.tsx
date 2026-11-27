import type { TFunction } from 'i18next';

import { FolderBreadcrumbs, FolderGlyph, FolderTreeRows } from '../../shared/folders/FolderTree.js';
import { folderDrag } from '../../shared/folders/folderDrag.js';
import { folderPath } from '../../shared/folders/folderTree.js';
import type { useAssessmentFolders } from './useAssessmentFolders.js';

const drag = folderDrag('application/x-lms-assessment');
export const startAssessmentDrag = drag.start;
export const assessmentFolderDrop = drag.drop;

export function AssessmentFolderNavigation({ library, move, t }: {
  library: ReturnType<typeof useAssessmentFolders>;
  move: (id: string, target: string | null) => void;
  t: TFunction;
}) {
  if (!library.data) return null;
  const { folders, rootAssessmentCount } = library.data;
  const root = library.rootLabel;
  const label = t('admin.checklists.folders.crumbs', 'Folder path');

  return <>
    <FolderBreadcrumbs folders={folderPath(folders, library.id)} label={label} rootLabel={root} onSelect={library.select} />
    <nav className="assessment-folder-tree" aria-label={t('admin.assessmentBuilder.folders.tree')}>
      <button className="checklist-library__open" type="button" aria-current={library.id === null ? 'page' : undefined}
        onClick={() => library.select(null)} {...assessmentFolderDrop(null, move)}>{root} ({rootAssessmentCount})</button>
      <FolderTreeRows folders={folders} expanded={library.expanded} render={({ folder, level, hasChildren }) => {
        const expanded = library.expanded.has(folder.id);
        return <div className="assessment-folder-tree__row" style={{ paddingInlineStart: `${(level - 1) * 12}px` }}>
          {hasChildren && <button className="ds-button ds-button--secondary ds-button--sm" aria-expanded={expanded}
            aria-label={t(expanded ? 'admin.assessmentBuilder.folders.collapse' : 'admin.assessmentBuilder.folders.expand', { name: folder.name })}
            type="button" onClick={() => library.toggle(folder.id)}><span aria-hidden="true">{expanded ? '▾' : '▸'}</span></button>}
          <button className="checklist-library__open checklist-library__folder" type="button"
            aria-current={folder.id === library.id ? 'page' : undefined} onClick={() => library.select(folder.id)}
            {...assessmentFolderDrop(folder.id, move)}>
            <FolderGlyph color={folder.color} /><span>{folder.name} ({folder.totalAssessmentCount})</span>
          </button>
        </div>;
      }} />
    </nav>
  </>;
}
