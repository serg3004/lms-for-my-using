import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuestionDefinition, PublicQuestionDefinition, QuestionResponse } from '@lms/shared/assessment-question-types';

import { AssessmentMaterialField, AssessmentPicture } from '../assessment-materials/AssessmentMaterial.js';

type ImageDrop = Extract<QuestionDefinition, { type: 'image_drop' }>;
type PublicImageDrop = Extract<PublicQuestionDefinition, { type: 'image_drop' }>;
type Zone = PublicImageDrop['zones'][number];
type DropObject = PublicImageDrop['objects'][number];
type Placement = { zoneId: string; objectId: string };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 10) / 10;
const defaultPoints = [{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const zoneStyle = (zone: Zone): CSSProperties => ({
  position: 'absolute', left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%`,
  borderRadius: zone.shape === 'ellipse' ? '50%' : 4, boxSizing: 'border-box',
  // The polygon is cut out of the zone box; the part outside it neither shows nor takes clicks.
  ...(zone.shape === 'polygon' && zone.points ? { clipPath: `polygon(${zone.points.map((point) => `${point.x}% ${point.y}%`).join(', ')})` } : {}),
});
const objectLabel = (object: { text: string }, index: number, t: (key: string) => string) => object.text || `${t('longreadExercises.dropObject')} ${index + 1}`;

/** The picture with its zones laid over it; zones are children so the author and the learner share the geometry. */
function Stage({ background, children, onPick }: { background: string; children?: React.ReactNode; onPick?: (x: number, y: number) => void }) {
  return <div style={{ position: 'relative', maxWidth: '100%', width: 640, touchAction: 'manipulation' }}
    onClick={onPick ? (event) => {
      if (event.target !== event.currentTarget && !(event.target instanceof HTMLImageElement)) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) onPick(((event.clientX - box.left) / box.width) * 100, ((event.clientY - box.top) / box.height) * 100);
    } : undefined}>
    <AssessmentPicture value={background} />
    {children}
  </div>;
}

export function ImageDropAuthor({ definition: d, onChange: patch }: { definition: ImageDrop; onChange: (definition: QuestionDefinition) => void }) {
  const { t } = useTranslation();
  const zoneNumber = (index: number) => t('longreadExercises.zone', { number: index + 1 });
  const setZone = (id: string, change: Partial<Zone>) => patch({ ...d, zones: d.zones.map((zone) => zone.id === id ? { ...zone, ...change } : zone) });
  const number = (id: string, key: 'x' | 'y' | 'width' | 'height', label: string, value: number, index: number) =>
    <label key={key} style={{ display: 'block' }}>{label}
      <input type="number" min={0} max={100} step={1} style={{ minHeight: 44, width: 90 }} aria-label={`${zoneNumber(index)}: ${label}`} value={value}
        onChange={(event) => setZone(id, { [key]: clamp(Number(event.target.value) || 0, 0, 100) })} />
    </label>;
  const addZone = (x = 10, y = 10) => {
    const zone: Zone = { id: crypto.randomUUID(), shape: 'rect', x: round(clamp(x - 10, 0, 80)), y: round(clamp(y - 7.5, 0, 85)), width: 20, height: 15 };
    patch({ ...d, zones: [...d.zones, zone], correctPairs: [...d.correctPairs, { zoneId: zone.id, objectId: d.objects[0]!.id }] });
  };
  return <>
    <p>{t('longreadExercises.dropHelp')}</p>
    <AssessmentMaterialField value={d.background || null} onChange={(material) => patch({ ...d, background: material ?? '' })} />
    {d.background ? <Stage background={d.background} onPick={d.zones.length < 30 ? addZone : undefined}>
      {d.zones.map((zone, index) => <span key={zone.id} aria-hidden="true" style={{ ...zoneStyle(zone), border: '2px solid var(--color-primary)', background: 'rgba(37, 99, 235, .18)', pointerEvents: 'none', fontSize: 12, padding: 2 }}>{index + 1}</span>)}
    </Stage> : <p role="status">{t('longreadExercises.dropNoImage')}</p>}
    {d.objects.map((object, index) => <div key={object.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
      <label style={{ display: 'block', minWidth: 0, flex: '1 1 220px' }}>{t('longreadExercises.dropObject')} {index + 1}
        <input style={{ width: '100%', minHeight: 44 }} maxLength={2000} value={object.text}
          onChange={(event) => patch({ ...d, objects: d.objects.map((item) => item.id === object.id ? { ...item, text: event.target.value } : item) })} />
      </label>
      <div style={{ flex: '1 1 100%', minWidth: 0 }}>
        <AssessmentMaterialField value={object.image ?? null} onChange={(material) => patch({ ...d, objects: d.objects.map((item) => {
          if (item.id !== object.id) return item;
          const next = { ...item };
          if (material) next.image = material; else delete next.image;
          return next;
        }) })} />
      </div>
      <button type="button" className="admin-btn admin-btn--secondary" disabled={d.objects.length <= 1} onClick={() => {
        const rest = d.objects.filter((item) => item.id !== object.id);
        patch({ ...d, objects: rest, correctPairs: d.correctPairs.map((pair) => pair.objectId === object.id ? { ...pair, objectId: rest[0]!.id } : pair) });
      }}>{t('longread.delete')}</button>
    </div>)}
    <button type="button" className="admin-btn admin-btn--secondary" disabled={d.objects.length >= 30}
      onClick={() => patch({ ...d, objects: [...d.objects, { id: crypto.randomUUID(), text: '' }] })}>{t('longreadExercises.addObject')}</button>
    {d.zones.map((zone, index) => <fieldset key={zone.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, minWidth: 0, margin: '8px 0' }}>
      <legend>{zoneNumber(index)}</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
        <label>{t('longreadExercises.zoneShape')}
          <select style={{ minHeight: 44 }} value={zone.shape} onChange={(event) => {
            const shape = event.target.value === 'ellipse' ? 'ellipse' : event.target.value === 'polygon' ? 'polygon' : 'rect';
            const next: Zone = { ...zone, shape };
            if (shape === 'polygon') next.points = zone.points ?? defaultPoints; else delete next.points;
            patch({ ...d, zones: d.zones.map((item) => item.id === zone.id ? next : item) });
          }}>
            <option value="rect">{t('longreadExercises.shapeRect')}</option><option value="ellipse">{t('longreadExercises.shapeEllipse')}</option>
            <option value="polygon">{t('longreadExercises.shapePolygon')}</option>
          </select>
        </label>
        {number(zone.id, 'x', t('longreadExercises.zoneX'), zone.x, index)}
        {number(zone.id, 'y', t('longreadExercises.zoneY'), zone.y, index)}
        {number(zone.id, 'width', t('longreadExercises.zoneWidth'), zone.width, index)}
        {number(zone.id, 'height', t('longreadExercises.zoneHeight'), zone.height, index)}
        <label>{t('longreadExercises.zoneCorrect')}
          <select style={{ minHeight: 44, maxWidth: '100%' }} value={d.correctPairs.find((pair) => pair.zoneId === zone.id)?.objectId ?? ''}
            onChange={(event) => patch({ ...d, correctPairs: d.correctPairs.map((pair) => pair.zoneId === zone.id ? { ...pair, objectId: event.target.value } : pair) })}>
            {d.objects.map((object, position) => <option key={object.id} value={object.id}>{objectLabel(object, position, t)}</option>)}
          </select>
        </label>
        <button type="button" className="admin-btn admin-btn--secondary" disabled={d.zones.length <= 1}
          onClick={() => patch({ ...d, zones: d.zones.filter((item) => item.id !== zone.id), correctPairs: d.correctPairs.filter((pair) => pair.zoneId !== zone.id) })}>{t('longread.delete')}</button>
      </div>
      {zone.shape === 'polygon' && zone.points && <div>
        <p>{t('longreadExercises.polygonHelp')}</p>
        {zone.points.map((corner, pointIndex) => <div key={pointIndex} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
          {(['x', 'y'] as const).map((axis) => <label key={axis}>{t(`longreadExercises.point${axis.toUpperCase()}`, { number: pointIndex + 1 })}
            <input type="number" min={0} max={100} step={1} style={{ minHeight: 44, width: 90 }} value={corner[axis]} aria-label={`${zoneNumber(index)}: ${t(`longreadExercises.point${axis.toUpperCase()}`, { number: pointIndex + 1 })}`}
              onChange={(event) => setZone(zone.id, { points: (zone.points ?? []).map((item, n) => n === pointIndex ? { ...item, [axis]: clamp(Number(event.target.value) || 0, 0, 100) } : item) })} />
          </label>)}
          <button type="button" className="admin-btn admin-btn--secondary" disabled={(zone.points?.length ?? 0) <= 3}
            onClick={() => setZone(zone.id, { points: (zone.points ?? []).filter((_, n) => n !== pointIndex) })}>{t('longread.delete')}</button>
        </div>)}
        <button type="button" className="admin-btn admin-btn--secondary" disabled={(zone.points?.length ?? 0) >= 12}
          onClick={() => setZone(zone.id, { points: [...(zone.points ?? []), { x: 50, y: 50 }] })}>{t('longreadExercises.addPoint')}</button>
      </div>}
    </fieldset>)}
    <button type="button" className="admin-btn admin-btn--secondary" disabled={d.zones.length >= 30} onClick={() => addZone()}>{t('longreadExercises.addZone')}</button>
  </>;
}

/** Click or drag an object onto a zone; the lists under the picture give the same choice without a pointer or on a phone. */
export function ImageDropResponse({ definition, response, onChange, id }: {
  definition: PublicImageDrop; response?: QuestionResponse; onChange: (response: QuestionResponse) => void; id: string;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(null);
  const placements: Placement[] = response?.type === 'image_drop' ? response.placements : [];
  const objectAt = (zoneId: string): DropObject | undefined => definition.objects.find((object) => object.id === placements.find((placement) => placement.zoneId === zoneId)?.objectId);
  const place = (zoneId: string, objectId: string) =>
    onChange({ type: 'image_drop', placements: [...placements.filter((placement) => placement.zoneId !== zoneId), ...(objectId ? [{ zoneId, objectId }] : [])] });
  return <div style={{ display: 'grid', gap: 12 }}>
    <p>{t('longreadExercises.dropPlay')}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {definition.objects.map((object, index) => <button key={object.id} type="button" className="admin-btn admin-btn--secondary" style={{ minHeight: 44, maxWidth: '100%', overflowWrap: 'anywhere' }}
        draggable aria-pressed={picked === object.id} aria-label={objectLabel(object, index, t)} onDragStart={(event) => { event.dataTransfer.setData('text/plain', object.id); setPicked(object.id); }}
        onClick={() => setPicked(picked === object.id ? null : object.id)}>
        {object.image && <AssessmentPicture value={object.image} alt="" style={{ display: 'block', maxWidth: 96, maxHeight: 64, height: 'auto', margin: '0 auto' }} />}{object.text}
      </button>)}
    </div>
    <Stage background={definition.background}>
      {definition.zones.map((zone, index) => {
        const placed = objectAt(zone.id);
        return <button key={zone.id} type="button" aria-label={`${t('longreadExercises.zone', { number: index + 1 })}: ${placed ? objectLabel(placed, definition.objects.indexOf(placed), t) : t('longreadExercises.zoneEmpty')}`}
          style={{ ...zoneStyle(zone), border: '2px dashed var(--color-primary)', background: placed ? 'rgba(37, 99, 235, .3)' : 'rgba(37, 99, 235, .12)', cursor: 'pointer', overflow: 'hidden', fontSize: 12, padding: 2, color: 'inherit', minWidth: 24, minHeight: 24 }}
          onClick={() => { if (picked) { place(zone.id, picked); setPicked(null); } else if (placed) place(zone.id, ''); }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); const objectId = event.dataTransfer.getData('text/plain'); if (definition.objects.some((object) => object.id === objectId)) { place(zone.id, objectId); setPicked(null); } }}>
          {placed ? placed.image ? <AssessmentPicture value={placed.image} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', margin: 'auto', objectFit: 'contain' }} /> : placed.text : index + 1}
        </button>;
      })}
    </Stage>
    {definition.zones.map((zone, index) => <div key={zone.id}>
      <label htmlFor={`${id}-zone-${index}`}>{t('longreadExercises.zoneChoose', { number: index + 1 })}</label>
      <select id={`${id}-zone-${index}`} style={{ minHeight: 44, width: '100%', maxWidth: '100%' }} value={objectAt(zone.id)?.id ?? ''} onChange={(event) => place(zone.id, event.target.value)}>
        <option value="">{t('longreadExercises.choose')}</option>
        {definition.objects.map((object, position) => <option key={object.id} value={object.id}>{objectLabel(object, position, t)}</option>)}
      </select>
    </div>)}
    <button type="button" className="admin-btn admin-btn--secondary" style={{ justifySelf: 'start' }} disabled={placements.length === 0}
      onClick={() => { setPicked(null); onChange({ type: 'image_drop', placements: [] }); }}>{t('longreadExercises.resetPlacements')}</button>
  </div>;
}
