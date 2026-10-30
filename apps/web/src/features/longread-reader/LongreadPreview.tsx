import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLongreadPreview, type LongreadReaderDocument } from '../../shared/api/longreads.js';
import { useAsyncData } from '../../shared/useAsyncData.js';
import { PageState } from '../../shared/ui.js';
import { LongreadReader } from './LongreadReader.js';

export default function LongreadPreview({ lessonId, chapterId }: { lessonId: string; chapterId?: string }) {
  const { t } = useTranslation(); const [width, setWidth] = useState('100%');
  const [local, setLocal] = useState<LongreadReaderDocument | null>(null);
  const { state, reload } = useAsyncData((signal) => getLongreadPreview(lessonId, chapterId, signal), [lessonId, chapterId], { error: t('longreadReader.previewError'), notFound: t('longreadReader.unavailable'), unauthenticated: t('longread.forbidden') });
  if (state.status !== 'loaded') return <PageState variant={state.status === 'loading' ? 'loading' : 'error'} message={state.status === 'loading' ? t('longreadReader.loading') : state.message} action={state.status !== 'loading' && <button type="button" onClick={() => void reload()}>{t('longread.retry')}</button>} />;
  const data = local ?? state.data;
  return <>
    <label htmlFor="longread-preview-width">{t('longreadReader.previewWidth')}</label>{' '}
    <select id="longread-preview-width" value={width} onChange={(event) => setWidth(event.target.value)} style={{ minHeight: 44, maxWidth: '100%' }}>
      <option value="100%">{t('longreadReader.desktop')}</option><option value="768px">{t('longreadReader.tablet')}</option><option value="375px">{t('longreadReader.phone')}</option>
    </select>
    <div style={{ width: '100%', maxWidth: width, marginInline: 'auto' }}>
      <LongreadReader data={data} onNavigate={(anchor, index) => {
        const position = data.chapters.findIndex((chapter) => chapter.anchor === anchor);
        if (position < 0) return;
        setLocal({ ...data, navigation: { ...data.navigation, chapter: anchor, headingIndex: index ?? null,
          previousAnchor: data.chapters[position - 1]?.anchor ?? null, nextAnchor: data.chapters[position + 1]?.anchor ?? null } });
      }} />
    </div>
  </>;
}
