// Offline precache list (ticket 0158): built from the real build output every time, so a new
// lazy chunk, sound, level or ad creative is offline-ready without anyone editing a list.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

// Build files that are never needed to play: source maps, legacy font formats (every browser
// we support reads woff2), and font subsets for scripts the game never prints (a stray glyph
// falls back to a system font; those subsets are still cached the first time one is used).
const SKIP_ASSET = [
  /\.map$/,
  /\.(woff|ttf|eot)$/,
  /-(cyrillic|cyrillic-ext|greek|greek-ext|vietnamese|hebrew|math|symbols)-[\w-]*\.woff2$/,
];
// Files in public/ that only matter to other sites (link previews) or to the host.
const SKIP_PUBLIC = [/^og\.(jpe?g|png)$/, /^_headers$/, /^_redirects$/, /^robots\.txt$/, /(^|\/)\.DS_Store$/];

/** Every file under `dir`, as forward-slash paths relative to it. */
export function walk(dir) {
  const out = [];
  let names = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) for (const f of walk(full)) out.push(`${name}/${f}`);
    else out.push(name);
  }
  return out.map((f) => f.split(sep).join('/'));
}

/**
 * The precache list: every emitted build file (`bundleFiles`, from Rollup's bundle) plus every
 * public file, minus the skip rules. Sorted, de-duplicated, never sw.js or the page itself
 * (the page is cached under the base path).
 */
export function precacheList(bundleFiles, publicFiles) {
  const assets = bundleFiles.filter((f) => !SKIP_ASSET.some((re) => re.test(f)));
  const pub = publicFiles.filter((f) => !SKIP_PUBLIC.some((re) => re.test(f)));
  return [...new Set([...assets, ...pub])]
    .filter((f) => f !== 'sw.js' && f !== 'index.html')
    .sort();
}

/** A short version id over the files' contents, so any change to any file ships a new cache. */
export function versionOf(entries) {
  const h = createHash('sha256');
  for (const [name, content] of entries) { h.update(name); h.update('\0'); h.update(content); h.update('\0'); }
  return h.digest('hex').slice(0, 12);
}

/** Contents of a bundle entry (chunk code or asset source) for hashing. */
export function bundleContent(item) {
  if (!item) return '';
  if (item.type === 'chunk') return item.code || '';
  return typeof item.source === 'string' ? item.source : Buffer.from(item.source || '');
}

export function publicContent(publicDir, f) {
  try { return readFileSync(join(publicDir, f)); } catch { return ''; }
}

export const rel = (from, to) => relative(from, to).split(sep).join('/');
