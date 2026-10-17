import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// Bundle budgets (AGENTS.md §5). The build runs before e2e, so dist/ is fresh here.
const DIR = 'dist/outatime/assets';
const gz = (f) => gzipSync(readFileSync(`${DIR}/${f}`), { level: 9 }).length / 1024;

test('main bundle stays in budget and does not contain three.js', () => {
  const files = readdirSync(DIR);
  const main = files.filter((f) => /^index-.*\.js$/.test(f));
  expect(main.length).toBe(1);
  expect(gz(main[0])).toBeLessThan(60);
  expect(readFileSync(`${DIR}/${main[0]}`, 'utf8')).not.toContain('WebGLRenderer');
});

test('the lazy 3D chunk stays in its own budget', () => {
  const view = readdirSync(DIR).filter((f) => /^view-.*\.js$/.test(f));
  expect(view.length).toBe(1);
  expect(gz(view[0])).toBeLessThan(170);
});
