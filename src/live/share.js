// One-tap invite (sprint 3): the native share sheet where there is one (phones, tablets),
// otherwise the link goes to the clipboard. Returns 'shared' | 'copied' | 'failed'.
export async function shareInvite({ url, title, text }) {
  if (navigator.share) {
    try { await navigator.share({ url, title, text }); return 'shared'; } catch (e) {
      if (e && e.name === 'AbortError') return 'failed';
    }
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok ? 'copied' : 'failed';
  } catch { return 'failed'; }
}

export function roomLink(code, loc = location) {
  return `${loc.origin}${import.meta.env.BASE_URL}?room=${code}`;
}
