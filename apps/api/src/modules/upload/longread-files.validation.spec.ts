import { BadRequestException } from '@nestjs/common';
import { collectFileIds, normalizeFileId, validateLongreadFileMetadata, validateLongreadObject } from './longread-files.validation.js';

import { compound, officeZip } from '../../integration/longread-files.fixtures.js';
const read = (bytes: Buffer) => async (start: number, end: number) => bytes.subarray(start, end + 1);

describe('longread upload policy and bounded content inspection', () => {
  it.each([
    ['pdf', 'application/pdf'], ['doc', 'application/msword'], ['ppt', 'application/vnd.ms-powerpoint'], ['xls', 'application/vnd.ms-excel'],
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'], ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['png', 'image/png'],
  ])('permits %s with matching metadata and the 50 MB boundary', (extension, type) => {
    expect(() => validateLongreadFileMetadata(`file.${extension}`, type, 50 * 1024 * 1024)).not.toThrow();
    expect(() => validateLongreadFileMetadata(`file.${extension}`, type, 50 * 1024 * 1024 + 1)).toThrow(BadRequestException);
  });
  it.each(['evil.svg', 'image.png.exe', 'folder/file.png', '../file.png', 'image.pdf'])('rejects misleading or unsafe image metadata: %s', (name) => expect(() => validateLongreadFileMetadata(name, 'image/png', 100)).toThrow());
  it.each([
    ['doc', 'application/msword', 'WordDocument'], ['xls', 'application/vnd.ms-excel', 'Workbook'], ['ppt', 'application/vnd.ms-powerpoint', 'PowerPoint Document'],
  ])('checks the compound document directory for %s', async (ext, mimeType, stream) => {
    const bytes = compound(stream), meta = { fileName: `file.${ext}`, mimeType, sizeBytes: bytes.length };
    await expect(validateLongreadObject(meta, read(bytes))).resolves.toBeUndefined();
    const wrong = compound('WrongStream'); await expect(validateLongreadObject(meta, read(wrong))).rejects.toThrow();
  });
  it.each([
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'word/document.xml'],
    ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'ppt/presentation.xml'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xl/workbook.xml'],
  ])('inspects OOXML container members for %s, not just PK magic', async (ext, mimeType, root) => {
    const bytes = officeZip(root), meta = { fileName: `file.${ext}`, mimeType, sizeBytes: bytes.length };
    await expect(validateLongreadObject(meta, read(bytes))).resolves.toBeUndefined();
    const fake = officeZip('other.xml'); await expect(validateLongreadObject({ ...meta, sizeBytes: fake.length }, read(fake))).rejects.toThrow();
    const bomb = officeZip(root, { expanded: 1001 }); await expect(validateLongreadObject({ ...meta, sizeBytes: bomb.length }, read(bomb))).rejects.toThrow();
    const encrypted = officeZip(root, { flags: 1 }); await expect(validateLongreadObject({ ...meta, sizeBytes: encrypted.length }, read(encrypted))).rejects.toThrow();
  });
  it('rejects forged image contents and retains nested file references without remapping them', async () => {
    const bytes = Buffer.from('<svg onload=alert(1)>');
    await expect(validateLongreadObject({ fileName: 'fake.png', mimeType: 'image/png', sizeBytes: bytes.length }, read(bytes))).rejects.toThrow();
    const a = '38600000-0000-4000-8000-00000000000a', b = '38600000-0000-4000-8000-00000000000b';
    expect(normalizeFileId(a.toUpperCase())).toBe(a); expect(normalizeFileId('opaque non-file identifier')).toBeNull();
    expect([...collectFileIds({ cover: { fileId: a.toUpperCase() }, nested: [{ content: { files: [{ fileId: b }, { fileId: a }, { fileId: 'opaque non-file identifier' }] } }] })]).toEqual([a, b]);
  });
});
