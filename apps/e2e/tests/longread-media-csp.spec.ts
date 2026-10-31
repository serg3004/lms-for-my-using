import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('the production CSP permits HTTPS media/ranges and storage PUT, confines frames and preserves script restrictions', async ({ page }) => {
  const config = readFileSync(new URL('../../../infra/nginx/security-headers.conf', import.meta.url), 'utf8');
  const policy = config.match(/Content-Security-Policy "([^"]+)"/)![1]!;
  const video = readFileSync(new URL('../fixtures/assets/longread-video.mp4', import.meta.url));
  const picture = readFileSync(new URL('../fixtures/assets/longread-safety.png', import.meta.url));
  let videoRanges = 0, uploaded = false, provider = false, foreignFrame = false;
  await page.route('https://storage.example.com/clip.mp4', (route) => {
    if (route.request().headers()['range']) videoRanges++;
    return route.fulfill({ status: 206, contentType: 'video/mp4', body: video, headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes 0-${video.length - 1}/${video.length}` } });
  });
  await page.route('https://storage.example.com/poster.png', (route) => route.fulfill({ contentType: 'image/png', body: picture }));
  await page.route('https://www.youtube-nocookie.com/embed/abcdefghijk', (route) => { provider = true; return route.fulfill({ contentType: 'text/html', body: '<html lang="en"><title>Provider</title><body>Provider</body></html>' }); });
  await page.route('https://evil.example/frame', (route) => { foreignFrame = true; return route.fulfill({ body: 'Must not load' }); });
  await page.route('https://storage.example.com/upload', (route) => {
    if (route.request().method() === 'PUT') uploaded = true;
    return route.fulfill({ status: 200, body: 'ok', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
  });
  await page.route('**/media-csp-probe', (route) => route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': policy }, body: '<!doctype html><html lang="en"><title>Media policy probe</title><body><video controls preload="metadata" src="https://storage.example.com/clip.mp4" poster="https://storage.example.com/poster.png"></video><iframe title="Provider" sandbox="allow-scripts allow-same-origin" src="https://www.youtube-nocookie.com/embed/abcdefghijk"></iframe></body></html>' }));
  await page.goto('/media-csp-probe');
  await expect.poll(() => page.locator('video').evaluate((node) => (node as HTMLVideoElement).duration)).toBeGreaterThan(1);
  expect(videoRanges).toBeGreaterThan(0); expect(provider).toBe(true);
  const result = await page.evaluate(async () => {
    const blocked: string[] = [];
    document.addEventListener('securitypolicyviolation', (event) => blocked.push(event.violatedDirective));
    const frame = document.createElement('iframe'); frame.src = 'https://evil.example/frame'; document.body.append(frame);
    const response = await fetch('https://storage.example.com/upload', { method: 'PUT', body: 'synthetic multipart part', credentials: 'omit' });
    return { ok: response.ok, blocked };
  });
  expect(result.ok).toBe(true); expect(uploaded).toBe(true); expect(foreignFrame).toBe(false); expect(result.blocked).toContain('frame-src');
  expect(policy).toContain("script-src 'self';"); expect(policy).toContain("object-src 'none'"); expect(policy).toContain("frame-ancestors 'none'"); expect(policy).not.toContain("'unsafe-eval'");
});
