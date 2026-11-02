import { useOptionalSession } from '../../shared/session.js';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collectFeedbackFields, defaultFeedbackLayout, type FeedbackFieldDef, type FeedbackLayout, type FeedbackSectionDef } from '@lms/shared/checklist-feedback';
import { listChecklistAnswerSets } from '../../shared/api/checklists.js';
import type { ChecklistAnswerSet } from '../../shared/api/types.js';
import { Button, Input, Menu } from '../../shared/ui.js';
import { OrderedList } from './OrderedList.js';
import { feedbackLabels } from './FeedbackFields.js';
export function FeedbackBuilder({ value, onChange, required }: { value: FeedbackLayout | null; onChange: (layout: FeedbackLayout | null) => void; required: boolean }) {
  const { t } = useTranslation(), labels = feedbackLabels(t);
  const roles = useOptionalSession()?.currentUser?.roles ?? [];
  const libraryBase = roles.includes('admin') || roles.includes('manager') ? '/admin/checklists' : roles.includes('instructor') ? '/instructor/checklists' : '/mentor';
  const [sets, setSets] = useState<ChecklistAnswerSet[]>([]), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const layout = value ?? defaultFeedbackLayout(required), fieldsCount = collectFeedbackFields(layout).length;
  const needsSets = collectFeedbackFields(layout).some((field) => field.kind === 'choice');
  useEffect(() => { if (!needsSets) return; let active = true; void listChecklistAnswerSets().then((data) => { if (active) { if (!Array.isArray(data)) throw new Error('Invalid answer set response'); setSets(data); setFailed(false); } }).catch(() => { if (active) setFailed(true); }); return () => { active = false; }; }, [retry, needsSets]);
  function update(node: FeedbackLayout | FeedbackSectionDef, id: string, change: (section: FeedbackSectionDef) => FeedbackSectionDef): FeedbackLayout | FeedbackSectionDef {
    return { ...node, sections: node.sections.map((section) => section.id === id ? change(section) : update(section, id, change) as FeedbackSectionDef) };
  }
  function container(id: string | null, patch: (node: FeedbackLayout | FeedbackSectionDef) => FeedbackLayout | FeedbackSectionDef) { onChange(id ? update(layout, id, patch as (node: FeedbackSectionDef) => FeedbackSectionDef) as FeedbackLayout : patch(layout) as FeedbackLayout); }
  function newSection(): FeedbackSectionDef { return { id: crypto.randomUUID(), title: t('feedbackBuilder.section'), fields: [], sections: [] }; }
  function sectionCount(sections: FeedbackSectionDef[]): number { return sections.reduce((count, section) => count + 1 + sectionCount(section.sections), 0); }
  function render(node: FeedbackLayout | FeedbackSectionDef, parentId: string | null, depth: number) {
    const referenced = new Set(collectFeedbackFields(layout).map((field) => field.answerSetId));
    const available = sets.filter((set) => set.status === 'active' || referenced.has(set.id));
    return <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <OrderedList items={node.fields} onChange={(fields) => container(parentId, (current) => ({ ...current, fields }))}>{(field) => {
        function patch(value: Partial<FeedbackFieldDef>) { container(parentId, (current) => ({ ...current, fields: current.fields.map((item) => item.id === field.id ? { ...field, ...value } : item) })); }
        return <div style={{ display: 'grid', gap: 10 }}>
          <Input label={t('feedbackBuilder.fieldName')} maxLength={255} value={field.title || (field.builtin ? labels[field.builtin] : '')} onChange={(event) => patch({ title: event.target.value })} />
          <label>{t('feedbackBuilder.type')} <select value={field.kind} onChange={(event) => { const kind = event.target.value as FeedbackFieldDef['kind']; container(parentId, (current) => ({ ...current, fields: current.fields.map((item) => item.id !== field.id ? item : { id: item.id, title: item.title || (item.builtin ? labels[item.builtin] : t('feedbackBuilder.field')), required: item.required, kind, ...(kind === 'choice' ? { answerSetId: available.find((set) => set.status === 'active')?.id, multiple: false } : {}) }) })); }}><option value="text">{t('feedbackBuilder.text')}</option><option value="choice">{t('feedbackBuilder.choice')}</option></select></label>
          {field.kind === 'choice' && <>
            <label>{t('feedbackBuilder.answerSet')} <select value={field.answerSetId ?? ''} onChange={(event) => patch({ answerSetId: event.target.value })}><option value="">{t('feedbackBuilder.selectSet')}</option>{available.map((set) => <option key={set.id} value={set.id}>{set.name}{set.status === 'archived' ? ` · ${t('admin.checklists.scaleManager.archived')}` : ''}</option>)}</select></label>
            <a href={`${libraryBase}/answer-sets`} target="_blank" rel="noreferrer">{t('feedbackBuilder.manageSets')}</a>
            <ul>{sets.find((set) => set.id === field.answerSetId)?.options.map((option) => <li key={option.id}>{option.name}{option.description ? ` — ${option.description}` : ''}</li>)}</ul>
            <label>{t('feedbackBuilder.selection')} <select value={field.multiple ? 'multiple' : 'single'} onChange={(event) => patch({ multiple: event.target.value === 'multiple' })}><option value="single">{t('feedbackBuilder.single')}</option><option value="multiple">{t('feedbackBuilder.multiple')}</option></select></label>
          </>}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}><input type="checkbox" style={{ width: 'auto' }} checked={field.required} onChange={(event) => patch({ required: event.target.checked })} />{t('feedbackBuilder.required')}</label>
          <Menu label={t('feedbackBuilder.actions')}><Button type="button" variant="secondary" disabled={fieldsCount <= 1} onClick={() => container(parentId, (current) => ({ ...current, fields: current.fields.filter(({ id }) => id !== field.id) }))}>{t('admin.checklists.scaleManager.delete')}</Button></Menu>
        </div>;
      }}</OrderedList>
      <Button type="button" variant="secondary" disabled={fieldsCount >= 30} onClick={() => container(parentId, (current) => ({ ...current, fields: [...current.fields, { id: crypto.randomUUID(), kind: 'text', title: t('feedbackBuilder.field'), required: false }] }))}>+ {t('feedbackBuilder.addField')}</Button>
      <OrderedList items={node.sections} onChange={(sections) => container(parentId, (current) => ({ ...current, sections }))}>{(section) => <section aria-label={section.title}>
        <Input label={t('feedbackBuilder.sectionName')} maxLength={255} value={section.title} onChange={(event) => container(section.id, (current) => ({ ...current, title: event.target.value }))} />
        <Button type="button" variant="secondary" disabled={collectFeedbackFields({ fields: [], sections: [section] }).length === fieldsCount} onClick={() => container(parentId, (current) => ({ ...current, sections: current.sections.filter(({ id }) => id !== section.id) }))}>{t('admin.checklists.scaleManager.delete')}</Button>
        {render(section, section.id, depth + 1)}
      </section>}</OrderedList>
      {depth < 3 && <Button type="button" variant="secondary" disabled={sectionCount(layout.sections) >= 30} onClick={() => container(parentId, (current) => ({ ...current, sections: [...current.sections, newSection()] }))}>+ {t(depth ? 'feedbackBuilder.addSubsection' : 'feedbackBuilder.addSection')}</Button>}
    </div>;
  }
  return <section className="admin-card admin-feedback-block" aria-label={t('admin.checklists.feedbackSectionTitle')}>
    <h3>{t('admin.checklists.feedbackSectionTitle')}</h3>
    <Input label={t('feedbackBuilder.title')} maxLength={255} value={layout.title ?? t('admin.checklists.feedbackSectionTitle')} onChange={(event) => onChange({ ...layout, title: event.target.value })} />
    {failed && <div role="alert">{t('feedbackBuilder.loadError')} <Button type="button" onClick={() => setRetry((value) => value + 1)}>{t('longread.retry')}</Button></div>}
    {render(layout, null, 0)}
    <Button type="button" variant="secondary" onClick={() => onChange(null)}>{t('feedbackBuilder.reset')}</Button>
  </section>;
}
