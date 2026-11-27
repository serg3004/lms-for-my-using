import { useTranslation } from 'react-i18next';

/** Pages where the person is answering (test, checklist run): the note would only distract there. */
export function isAnsweringPath(pathname: string): boolean {
  return /\/take$/.test(pathname) || /\/checklists\/sessions\/(?!all$)[^/]+$/.test(pathname);
}

/** One quiet line with the author of the product; the single place that prints it. */
export function AuthorshipNote({ pathname }: { pathname?: string }) {
  const { t } = useTranslation();
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  if (isAnsweringPath(path)) return null;
  return <p className="authorship-note">{t('app.authorship')}</p>;
}
