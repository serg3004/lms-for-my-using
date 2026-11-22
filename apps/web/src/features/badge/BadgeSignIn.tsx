import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { badgeLogin } from '../../shared/api/badge.js';
import type { CurrentUser } from '../../shared/api/types.js';
import { ApiClientError } from '../../shared/apiClient.js';
import { badgeTokenFrom, createQrDetector } from './badgeToken.js';

type Step = 'scan' | 'checking' | 'pin';
type Problem = 'invalid' | 'error' | 'camera' | 'unsupported' | null;

const target = { minHeight: 56, minWidth: 56, fontSize: '1.25rem', cursor: 'pointer' } as const;

/**
 * PR 506: the scan screen of a shared device. The badge is read by the camera, by a scanner that types, or from the link of the
 * QR (`/badge#<token>`). The token is taken out of the address at once and kept only here; the PIN is typed on large buttons.
 */
export function BadgeSignIn({ onSignedIn, initialToken = null, scanMs = 300 }: { onSignedIn: (user: CurrentUser) => void; initialToken?: string | null; scanMs?: number }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('scan');
  const [problem, setProblem] = useState<Problem>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [typed, setTyped] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const done = useRef(onSignedIn);
  done.current = onSignedIn;

  const submit = useCallback(async (value: string, secret?: string) => {
    setStep('checking');
    setProblem(null);
    try {
      const answer = await badgeLogin(value, secret);
      if (answer.status === 'ok') { done.current(answer.user); return; }
      setToken(value);
      setPin('');
      setStep('pin');
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : 0;
      setProblem(status === 401 ? 'invalid' : 'error');
      if (status === 401 && secret !== undefined) { setToken(value); setPin(''); setStep('pin'); } else { setToken(null); setStep('scan'); }
    }
  }, []);

  const take = useCallback((text: string) => {
    const value = badgeTokenFrom(text);
    if (!value) { setProblem('invalid'); return; }
    setCameraOn(false);
    setTyped('');
    void submit(value);
  }, [submit]);

  useEffect(() => {
    if (!initialToken) return;
    // The link opened from a phone camera: the token leaves the address bar and the history at once.
    window.history.replaceState(null, '', window.location.pathname);
    take(initialToken);
  }, [initialToken, take]);

  useEffect(() => {
    if (!cameraOn || step !== 'scan') return;
    const detector = createQrDetector();
    if (!detector || !navigator.mediaDevices?.getUserMedia) { setProblem('unsupported'); setCameraOn(false); return; }
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(async (opened) => {
      if (stopped) { opened.getTracks().forEach((track) => track.stop()); return; }
      stream = opened;
      if (video.current) { video.current.srcObject = opened; await video.current.play().catch(() => undefined); }
      timer = setInterval(() => {
        if (!video.current) return;
        void detector.detect(video.current).then((codes) => {
          const found = codes.map((code) => badgeTokenFrom(code.rawValue)).find(Boolean);
          if (found && !stopped) take(found);
        }).catch(() => undefined);
      }, scanMs);
    }).catch(() => { if (!stopped) { setProblem('camera'); setCameraOn(false); } });
    return () => { stopped = true; if (timer) clearInterval(timer); stream?.getTracks().forEach((track) => track.stop()); };
  }, [cameraOn, step, scanMs, take]);

  function press(digit: string) {
    setPin((current) => (current.length < 6 ? current + digit : current));
  }

  function enter(event: FormEvent) {
    event.preventDefault();
    if (token && pin.length >= 4) void submit(token, pin);
  }

  const message = problem ? t(problem === 'invalid' && step === 'pin' ? 'badge.pin.wrong' : `badge.scan.${problem === 'camera' ? 'cameraDenied' : problem === 'unsupported' ? 'cameraUnsupported' : problem}`) : null;
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {step === 'checking' && <p role="status">{t('badge.scan.checking')}</p>}
      {step === 'scan' && <>
        <p style={{ margin: 0 }}>{t('badge.scan.hint')}</p>
        {cameraOn && <video ref={video} aria-label={t('badge.scan.cameraLabel')} muted playsInline style={{ width: '100%', maxHeight: '40vh', background: '#000', objectFit: 'cover' }} />}
        <button className="login-form__submit" type="button" style={target} onClick={() => { setProblem(null); setCameraOn(!cameraOn); }}>{t(cameraOn ? 'badge.scan.cameraStop' : 'badge.scan.cameraStart')}</button>
        <form onSubmit={(event) => { event.preventDefault(); take(typed); }} style={{ display: 'grid', gap: '0.5rem' }}>
          <label htmlFor="badge-code">{t('badge.scan.manualLabel')}</label>
          <input id="badge-code" autoComplete="off" autoCorrect="off" spellCheck={false} value={typed} onChange={(event) => setTyped(event.target.value)} style={{ minHeight: 56, fontSize: '1rem' }} />
          <small>{t('badge.scan.manualHint')}</small>
          <button className="password-reset-secondary" type="submit" disabled={typed.trim() === ''} style={target}>{t('badge.scan.manualSubmit')}</button>
        </form>
      </>}
      {step === 'pin' && <form onSubmit={enter} style={{ display: 'grid', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('badge.pin.title')}</h2>
        <p style={{ margin: 0 }}>{t('badge.pin.hint')}</p>
        <label htmlFor="badge-pin">{t('badge.pin.label')}</label>
        <input id="badge-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
          style={{ minHeight: 56, fontSize: '1.5rem', letterSpacing: '0.4em', textAlign: 'center' }} />
        <div role="group" aria-label={t('badge.pin.label')} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => <button key={digit} className="password-reset-secondary" type="button" aria-label={t('badge.pin.digit', { digit })} style={target} onClick={() => press(digit)}>{digit}</button>)}
          <button className="password-reset-secondary" type="button" style={target} onClick={() => setPin((current) => current.slice(0, -1))}>{t('badge.pin.erase')}</button>
          <button className="password-reset-secondary" type="button" aria-label={t('badge.pin.digit', { digit: '0' })} style={target} onClick={() => press('0')}>0</button>
          <button className="login-form__submit" type="submit" disabled={pin.length < 4} style={target}>{t('badge.pin.submit')}</button>
        </div>
        <button className="password-reset-secondary" type="button" style={target} onClick={() => { setStep('scan'); setToken(null); setPin(''); setProblem(null); }}>{t('badge.pin.cancel')}</button>
      </form>}
      {message && <p role="alert">{message}</p>}
      <Link className="login-form__forgot" to="/login">{t('badge.scan.toLogin')}</Link>
    </div>
  );
}
