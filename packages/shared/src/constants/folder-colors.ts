export const FOLDER_COLORS = ['purple', 'green', 'blue', 'orange', 'pink', 'gray'] as const;
export type FolderColor = (typeof FOLDER_COLORS)[number];
