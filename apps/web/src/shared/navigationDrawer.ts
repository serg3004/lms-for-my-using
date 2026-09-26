import { useEffect, useRef, useState } from 'react';

/**
 * Off-canvas sidebar state shared by the admin and workspace shells: below `breakpoint` the sidebar
 * is inert and hidden from assistive tech until opened, Escape closes it, and focus moves to the
 * close button on open and back to the menu button on close.
 */
export function useNavigationDrawer(breakpoint: string) {
  const [isOpen, setIsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  function open() {
    setIsOpen(true);
    requestAnimationFrame(() => closeButtonRef.current?.focus());
  }

  function close() {
    setIsOpen(false);
    menuButtonRef.current?.focus();
  }

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${breakpoint})`);
    const syncViewport = () => {
      const hidden = media.matches && !isOpen;
      sidebarRef.current?.toggleAttribute('inert', hidden);
      if (hidden) sidebarRef.current?.setAttribute('aria-hidden', 'true');
      else sidebarRef.current?.removeAttribute('aria-hidden');
    };
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, [breakpoint, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return { isOpen, open, close, menuButtonRef, closeButtonRef, sidebarRef };
}
