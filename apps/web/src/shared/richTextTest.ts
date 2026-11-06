import type { Editor } from '@tiptap/core';
import { descriptionHtml } from '@lms/shared/checklist-description';
/** Drive the real TipTap instance in jsdom; native input.value no longer represents rich fields. */
export function setRichText(element: Element, value: string) {
  (element as HTMLElement & { editor: Editor }).editor.commands.setContent(descriptionHtml(value));
}
