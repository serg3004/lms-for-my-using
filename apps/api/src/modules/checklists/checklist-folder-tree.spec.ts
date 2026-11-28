import { MAX_FOLDER_DEPTH, canManageFolder, folderAccessMode, folderDepth, indexFolders, normalizeFolderName, subtreeHeight, subtreeIds, visibleFolderIds, type FolderNode } from './checklist-folder-tree.js';

const node = (id: string, parentId: string | null, createdBy: string | null = 'author', visibleToStaff = false): FolderNode => ({ id, parentId, createdBy, visibleToStaff });
// a -> b -> c -> d -> e (five levels) and a second root x -> y
const chain = [node('a', null), node('b', 'a'), node('c', 'b'), node('d', 'c'), node('e', 'd'), node('x', null), node('y', 'x')];

describe('checklist folder tree (PR 395)', () => {
  it('counts levels from 1 and allows five', () => {
    const byId = indexFolders(chain);
    expect(folderDepth('a', byId)).toBe(1);
    expect(folderDepth('e', byId)).toBe(MAX_FOLDER_DEPTH);
    expect(folderDepth('y', byId)).toBe(2);
  });

  it('collects a subtree at every level and measures its height', () => {
    expect(subtreeIds('b', chain).sort()).toEqual(['b', 'c', 'd', 'e']);
    expect(subtreeIds('y', chain)).toEqual(['y']);
    expect(subtreeHeight('a', chain)).toBe(5);
    expect(subtreeHeight('x', chain)).toBe(2);
    expect(subtreeHeight('e', chain)).toBe(1);
  });

  it('survives a corrupted loop instead of running forever', () => {
    const loop = [node('p', 'q'), node('q', 'p')];
    expect(folderDepth('p', indexFolders(loop))).toBe(2);
    expect(subtreeIds('p', loop).sort()).toEqual(['p', 'q']);
    expect(subtreeHeight('p', loop)).toBeGreaterThan(0);
  });

  it('lets only the administrator and the creator manage a folder', () => {
    const folder = node('a', null, 'author');
    expect(canManageFolder(folder, { id: 'author', roles: ['instructor'] })).toBe(true);
    expect(canManageFolder(folder, { id: 'boss', roles: ['admin'] })).toBe(true);
    expect(canManageFolder(folder, { id: 'other', roles: ['manager'] })).toBe(false);
    expect(canManageFolder(node('z', null, null), { id: 'other', roles: ['manager'] })).toBe(false);
  });

  it('shows the administrator everything and a learner nothing', () => {
    const folders = [node('a', null, 'author', true)];
    expect([...visibleFolderIds(folders, { id: 'boss', roles: ['admin'] })]).toEqual(['a']);
    expect(visibleFolderIds(folders, { id: 'kid', roles: ['learner'] }).size).toBe(0);
  });

  it('shows staff a folder they created or one opened to staff, and requires the whole parent chain', () => {
    const folders = [
      node('open', null, 'author', true),
      node('open-child', 'open', 'author', true),
      node('closed', null, 'author', false),
      node('closed-child', 'closed', 'author', true), // opened, but its parent is not
      node('mine', null, 'me', false),
      node('mine-under-closed', 'closed', 'me', false), // created by the actor, but the parent is hidden from them
    ];
    const seen = visibleFolderIds(folders, { id: 'me', roles: ['instructor'] });
    expect([...seen].sort()).toEqual(['mine', 'open', 'open-child']);
  });

  it('shows a folder opened to the actor by name, but only when its parents are visible too (PR 515)', () => {
    const named = (id: string, parentId: string | null, sharedUserIds: string[]): FolderNode => ({ id, parentId, createdBy: 'author', visibleToStaff: false, sharedUserIds });
    const folders = [named('shared', null, ['me']), named('other', null, ['someone']), named('under-closed', 'other', ['me']), named('shared-child', 'shared', ['me'])];
    expect([...visibleFolderIds(folders, { id: 'me', roles: ['manager'] })].sort()).toEqual(['shared', 'shared-child']);
    expect(visibleFolderIds(folders, { id: 'me', roles: ['learner'] }).size).toBe(0);
  });

  it('opens a folder to the chosen roles, with its parents, and names the access mode (PR 576)', () => {
    const roles = (id: string, parentId: string | null, accessRoles: string[]): FolderNode => ({ id, parentId, createdBy: 'author', visibleToStaff: false, accessRoles });
    const folders = [roles('for-managers', null, ['manager']), roles('inside', 'for-managers', ['manager', 'mentor']), roles('for-mentors', null, ['mentor']), roles('under-mentors', 'for-mentors', ['manager'])];
    expect([...visibleFolderIds(folders, { id: 'me', roles: ['manager'] })].sort()).toEqual(['for-managers', 'inside']);
    expect([...visibleFolderIds(folders, { id: 'me', roles: ['mentor'] })].sort()).toEqual(['for-mentors']);
    expect([...visibleFolderIds(folders, { id: 'me', roles: ['instructor'] })]).toEqual([]);
    expect(visibleFolderIds(folders, { id: 'me', roles: ['learner'] }).size).toBe(0);
    expect(folderAccessMode({ visibleToStaff: true, accessRoles: ['manager'] })).toBe('all');
    expect(folderAccessMode({ visibleToStaff: false, accessRoles: ['manager'] })).toBe('roles');
    expect(folderAccessMode({ visibleToStaff: false, accessRoles: [] })).toBe('owner');
    expect(folderAccessMode({ visibleToStaff: false })).toBe('owner');
  });

  it('treats names as equal regardless of case and surrounding spaces', () => {
    expect(normalizeFolderName('  Магазин ')).toBe(normalizeFolderName('магазин'));
  });
});
