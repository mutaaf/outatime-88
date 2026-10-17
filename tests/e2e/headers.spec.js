import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// The zone injects Cloudflare Web Analytics into HTML unless the response says no-transform.
// The build must emit dist/_headers so the game ships without a third-party beacon.
test('build emits no-transform headers for the game HTML', () => {
  const headers = readFileSync('dist/_headers', 'utf8');
  for (const path of ['/outatime/', '/outatime/index.html']) {
    expect(headers).toContain(`${path}\n  Cache-Control: public, max-age=0, must-revalidate, no-transform`);
  }
});
