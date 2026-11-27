import { useEffect, useId, useState } from 'react';
import type { TFunction } from 'i18next';

import { connectMaterial, listMaterialLibrary, type LibraryMaterial } from '../../shared/api/materialLibrary.js';

/**
 * PR 582: "Connect a material from the library" for the open course, and for a lesson of it when one is chosen.
 * Materials already in this course are not offered. Connecting never copies the material.
 */
export function ConnectLibraryMaterial({ courseId, lessons, connectedIds, onConnected, t }: {
  courseId: string;
  lessons: { id: string; title: string; order: number }[];
  connectedIds: string[];
  onConnected: () => void;
  t: TFunction;
}) {
  const id = useId();
  const [library, setLibrary] = useState<LibraryMaterial[] | null>(null);
  const [materialId, setMaterialId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'error' | 'failed'>('idle');

  useEffect(() => {
    let current = true;
    setLibrary(null);
    void listMaterialLibrary().then((items) => { if (current) setLibrary(items); }).catch(() => { if (current) setState('failed'); });
    return () => { current = false; };
  }, [courseId]);

  const offered = (library ?? []).filter((material) => material.courseId !== courseId && !connectedIds.includes(material.id));

  async function connect() {
    if (!materialId) return;
    setState('saving');
    try {
      await connectMaterial(courseId, materialId, lessonId || null);
      setMaterialId('');
      setState('idle');
      onConnected();
    } catch {
      setState('error');
    }
  }

  return (
    <section className="admin-form" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t('admin.materials.connect.title', 'Connect a material from the library')}</h2>
      {state === 'failed' ? <p className="admin-form__error" role="alert">{t('admin.materialLibrary.loadError', 'Unable to load the material library.')}</p>
        : offered.length === 0 && library ? <p className="admin-form__hint">{t('admin.materials.connect.none', 'There are no library materials to connect.')} <a href="/admin/material-library">{t('admin.materialLibrary.title', 'Material library')}</a></p>
        : (
          <>
            <label htmlFor={`${id}-material`}>{t('admin.materials.connect.material', 'Material')}</label>
            <select id={`${id}-material`} value={materialId} onChange={(event) => setMaterialId(event.target.value)}>
              <option value="">{t('admin.materials.connect.choose', 'Choose a material')}</option>
              {offered.map((material) => <option key={material.id} value={material.id}>{material.title}</option>)}
            </select>
            <label htmlFor={`${id}-lesson`}>{t('admin.materials.lesson', 'Lesson')}</label>
            <select id={`${id}-lesson`} value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
              <option value="">{t('admin.materials.noLesson', 'No lesson')}</option>
              {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.order}. {lesson.title}</option>)}
            </select>
            {state === 'error' && <p className="admin-form__error" role="alert">{t('admin.materials.connect.error', 'Unable to connect the material.')}</p>}
            <div className="admin-form__actions">
              <button className="admin-btn admin-btn--primary" type="button" disabled={!materialId || state === 'saving'} onClick={() => void connect()}>{t('admin.materials.connect.button', 'Connect')}</button>
            </div>
          </>
        )}
    </section>
  );
}
