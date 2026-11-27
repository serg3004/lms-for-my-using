import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { assertFolderDepth, assertFolderNameFree, folderCycle, folderSkipReason, folderTooDeep, FolderMoveException } from './folder-rules.js';

describe('folder rules (PR 580)', () => {
  const folders = [
    { id: 'a', parentId: null, name: 'Safety' },
    { id: 'b', parentId: 'a', name: 'Fire' },
  ];

  it('refuses a folder deeper than five levels and accepts five', () => {
    expect(() => assertFolderDepth(5)).not.toThrow();
    expect(() => assertFolderDepth(6)).toThrow(FolderMoveException);
  });

  it('refuses a name already used by a sibling, without regard to case, and lets a folder keep its own name', () => {
    expect(() => assertFolderNameFree(folders, null, ' safety ')).toThrow(ConflictException);
    expect(() => assertFolderNameFree(folders, null, 'Safety', 'a')).not.toThrow();
    expect(() => assertFolderNameFree(folders, 'a', 'Safety')).not.toThrow();
  });

  it('maps an error of one row to the reason a bulk result shows', () => {
    expect(folderSkipReason(folderCycle())).toBe('cycle');
    expect(folderSkipReason(folderTooDeep())).toBe('too_deep');
    expect(folderSkipReason(new NotFoundException())).toBe('not_found');
    expect(folderSkipReason(new ForbiddenException())).toBe('forbidden');
    expect(folderSkipReason(new ConflictException())).toBe('name_conflict');
    expect(folderSkipReason(new BadRequestException('x'))).toBeUndefined();
    expect(folderSkipReason(new Error('boom'))).toBeUndefined();
  });
});
