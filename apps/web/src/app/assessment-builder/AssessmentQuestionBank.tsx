import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../shared/apiClient.js';
import { Button } from '../../shared/ui.js';
import { AssessmentEditorQuestions } from './AssessmentEditorQuestions.js';
import { newEditorQuestion, type EditorQuestion } from './editorModel.js';

type Content = Omit<EditorQuestion, 'id' | 'options' | 'bankEntryId'> & {
  options: Omit<EditorQuestion['options'][number], 'id'>[];
};
type Entry = { id: string; title: string; content: Content };
type Bank = { folders: { id: string; name: string }[]; entries: Entry[] };
type Usage = {
  confirmation: string;
  assessments: { title: string }[];
  courses: { title: string }[];
  longreads: { title: string }[];
};

function write<T>(path: string, body: unknown, method = 'POST') {
  return apiRequest<T>(path, { method, body: JSON.stringify(body) });
}

function questionContent(question: EditorQuestion): Content {
  const { title, type, text, imageUrl, points, definition, scoringMode, options, correctFeedback, incorrectFeedback } = question;
  return {
    title, type, text, imageUrl, points, definition, scoringMode, correctFeedback, incorrectFeedback,
    options: options.map(({ text, imageUrl, isCorrect }) => ({ text, imageUrl, isCorrect })),
  };
}

export function AssessmentQuestionBank({ assessmentId, disabled, selectedId, changed }: {
  assessmentId: string;
  disabled: boolean;
  selectedId?: string;
  changed: () => void;
}) {
  const { t } = useTranslation();
  const label = (key: string) => t(`questionBank.${key}`);
  const [open, setOpen] = useState(Boolean(selectedId));
  const [bank, setBank] = useState<Bank>({ folders: [], entries: [] });
  const [folderId, setFolderId] = useState('');
  const [sampleSize, setSampleSize] = useState(1);
  const [search, setSearch] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [editor, setEditor] = useState<EditorQuestion[]>([]);
  const [entryId, setEntryId] = useState<string>();
  const [usage, setUsage] = useState<Usage>();
  const [error, setError] = useState(false);
  const [rowErrors, setRowErrors] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ search, ...(folderId ? { folderId } : {}) });
    const timer = window.setTimeout(() => {
      void apiRequest<Bank>(`/question-bank?${query}`, { signal: controller.signal }).then(setBank, () => {
        if (!controller.signal.aborted) setError(true);
      });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, search, folderId, revision]);

  function edit(entry: Entry) {
    setEntryId(entry.id);
    setUsage(undefined);
    setEditor([{ ...newEditorQuestion(), ...entry.content,
      options: entry.content.options.map((option) => ({ ...option, id: crypto.randomUUID() })),
    }]);
  }

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setOpen(true);
    void apiRequest<Entry>(`/question-bank/${selectedId}`, { signal: controller.signal }).then(edit, () => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [selectedId]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(false);
    try { await action(); }
    catch { setError(true); }
    finally { setBusy(false); }
  }

  async function save() {
    const [question] = editor;
    if (!question) return;
    const content = questionContent(question);
    if (entryId && !usage) {
      setUsage(await apiRequest<Usage>(`/question-bank/${entryId}/usage`));
      return;
    }
    if (entryId) {
      await write(`/question-bank/${entryId}`, { content, confirmation: usage?.confirmation }, 'PATCH');
      changed();
    } else {
      await write('/question-bank', { folderId, content });
      setEditor([]);
      setRevision((value) => value + 1);
    }
  }

  async function template() {
    const { Workbook } = await import('exceljs');
    const book = new Workbook();
    book.addWorksheet('Questions').addRows([
      ['title', 'correct_answer', 'incorrect_answer'],
      [label('exampleQuestion'), label('exampleCorrect'), label('exampleIncorrect')],
    ]);
    const blob = new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'question-bank.xlsx';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function upload(file: File) {
    if (file.size > 1024 * 1024) throw new Error('File too large');
    const { Workbook } = await import('exceljs');
    const book = new Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    const sheet = book.worksheets[0];
    if (!sheet || sheet.rowCount > 101) throw new Error('Invalid row count');
    const rows: { row: number; content: Content }[] = [];
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      rows.push({ row: number, content: {
        ...questionContent(newEditorQuestion()), title: row.getCell(1).text,
        options: [2, 3].map((column) => ({ text: row.getCell(column).text, imageUrl: null, isCorrect: column === 2 })),
      } });
    });
    const result = await write<{ errors: number[] }>('/question-bank/import', { folderId, rows });
    setRowErrors(result.errors);
    setRevision((value) => value + 1);
  }

  return <section className="admin-form">
    <Button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{label('title')}</Button>
    {open && <>
      <label>{label('search')} <input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label>{label('folder')} <select value={folderId} onChange={(event) => { setFolderId(event.target.value); setEditor([]); setUsage(undefined); }}>
        <option value="">{label('allFolders')}</option>
        {bank.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
      </select></label>
      <label>{label('newFolder')} <input value={newFolder} maxLength={200} onChange={(event) => setNewFolder(event.target.value)} /></label>
      <Button type="button" disabled={busy || !newFolder.trim()} onClick={() => void run(async () => {
        const folder = await write<{ id: string }>('/question-bank/folders', { name: newFolder.trim() });
        setNewFolder('');
        setFolderId(folder.id);
        setRevision((value) => value + 1);
      })}>{label('createFolder')}</Button>
      <Button type="button" disabled={!folderId || busy} onClick={() => { setEditor([newEditorQuestion()]); setEntryId(undefined); setUsage(undefined); }}>
        {label('newQuestion')}
      </Button>
      <label>{label('sampleSize')} <input type="number" min={1} max={100} value={sampleSize} onChange={(event) => setSampleSize(Number(event.target.value))} /></label>
      <Button type="button" disabled={!folderId || busy || disabled || sampleSize < 1 || sampleSize > 100} onClick={() => void run(async () => {
        await write(`/assessments/${assessmentId}/question-bank-sample`, { folderId, size: sampleSize });
        changed();
      })}>{label('sample')}</Button>
      <Button type="button" onClick={() => void run(template)}>{label('template')}</Button>
      <label>{label('import')} <input type="file" accept=".xlsx" disabled={!folderId || busy} onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void run(() => upload(file));
      }} /></label>
      {rowErrors.length > 0 && <p role="alert">{label('rowErrors')} {rowErrors.join(', ')}</p>}
      {error && <p role="alert">{label('error')}</p>}
      <ul>{bank.entries.map((entry) => <li key={entry.id}>
        {entry.title}{' '}
        <Button type="button" disabled={busy || disabled} onClick={() => void run(async () => {
          await write(`/assessments/${assessmentId}/question-bank/${entry.id}`, {});
          changed();
        })}>{label('link')}</Button>{' '}
        <Button type="button" disabled={busy || disabled} onClick={() => edit(entry)}>{label('edit')}</Button>
      </li>)}</ul>
      {editor.length > 0 && <>
        <AssessmentEditorQuestions questions={editor} onChange={(items) => { setEditor(items.slice(0, 1)); setUsage(undefined); }} onPreview={() => undefined} single />
        {usage && <div role="status">
          <p>{label('confirm')}</p>
          {(['assessments', 'courses', 'longreads'] as const).map((key) => <div key={key}>
            <strong>{label(key)} ({usage[key].length})</strong>
            <ul>{usage[key].map((item, index) => <li key={index}>{item.title}</li>)}</ul>
          </div>)}
        </div>}
        <Button type="button" disabled={busy || (Boolean(entryId) && disabled)} onClick={() => void run(save)}>
          {label(usage ? 'confirmSave' : 'save')}
        </Button>
        <Button type="button" onClick={() => { setEditor([]); setUsage(undefined); }}>{label('cancel')}</Button>
      </>}
    </>}
  </section>;
}
