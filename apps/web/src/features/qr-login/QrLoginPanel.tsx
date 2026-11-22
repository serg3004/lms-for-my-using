import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getQrLoginStatus, startQrLogin, type QrStart } from '../../shared/api/qrLogin.js';
import type { CurrentUser } from '../../shared/api/types.js';
import { qrSvg } from '../admin-checklists/publicQr.js';

type Phase = 'starting' | 'waiting' | 'denied' | 'failed';

/**
 * PR 505: the device shows a QR and waits for a phone to confirm. The code in the QR goes after `#`, so it never reaches a
 * server log; the secret that opens the session stays in this component and is never drawn.
 */
export function QrLoginPanel({ onSignedIn, pollMs = 2000 }: { onSignedIn: (user: CurrentUser) => void; pollMs?: number }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('starting');
  const [request, setRequest] = useState<QrStart | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const alive = useRef(true);
  const signedIn = useRef(onSignedIn);
  signedIn.current = onSignedIn;

  const begin = useCallback(async () => {
    setPhase('starting');
    try {
      const started = await startQrLogin();
      if (!alive.current) return;
      setRequest(started);
      setPhase('waiting');
    } catch {
      if (alive.current) setPhase('failed');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void begin();
    return () => { alive.current = false; };
  }, [begin]);

  useEffect(() => {
    if (phase !== 'waiting' || !request) return;
    const controller = new AbortController();
    const expires = new Date(request.expiresAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((expires - Date.now()) / 1000)));
    tick();
    const clock = setInterval(tick, 1000);
    const poll = setInterval(() => {
      void getQrLoginStatus(request.pollToken, controller.signal).then((answer) => {
        if (!alive.current || controller.signal.aborted) return;
        if (answer.status === 'approved') signedIn.current(answer.user);
        else if (answer.status === 'denied') setPhase('denied');
        else if (answer.status === 'expired') void begin();
      }).catch(() => undefined);
    }, pollMs);
    return () => { controller.abort(); clearInterval(clock); clearInterval(poll); };
  }, [phase, request, pollMs, begin]);

  const image = useMemo(() => {
    if (!request) return null;
    const url = `${window.location.origin}/qr-login#${request.code}`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(url))}`;
  }, [request]);

  return (
    <div style={{ display: 'grid', gap: '0.75rem', justifyItems: 'center', textAlign: 'center' }}>
      <p style={{ margin: 0 }}>{t('qrLogin.hint')}</p>
      {phase === 'starting' && <p role="status">{t('qrLogin.starting')}</p>}
      {phase === 'waiting' && image && <>
        <img alt={t('qrLogin.imageLabel')} src={image} style={{ width: '100%', maxWidth: 260, height: 'auto', background: '#fff' }} />
        <p role="timer" aria-live="off" style={{ margin: 0, fontSize: '0.9rem' }}>{t('qrLogin.expiresIn', { seconds: secondsLeft })}</p>
        <p role="status" style={{ margin: 0, fontSize: '0.9rem' }}>{t('qrLogin.waiting')}</p>
      </>}
      {phase === 'denied' && <p role="alert">{t('qrLogin.denied')}</p>}
      {phase === 'failed' && <p role="alert">{t('qrLogin.failed')}</p>}
      {(phase === 'denied' || phase === 'failed' || phase === 'waiting') && <button className="password-reset-secondary" type="button" onClick={() => void begin()} style={{ minHeight: '2.5rem', cursor: 'pointer' }}>{t('qrLogin.refresh')}</button>}
      <p style={{ margin: 0, fontSize: '0.85rem' }}>{t('qrLogin.warning')}</p>
    </div>
  );
}
