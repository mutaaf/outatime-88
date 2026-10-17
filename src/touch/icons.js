// Inline SVG icons for the touch controls (ticket 0061): bold, friendly glyphs a kid reads at a
// glance, drawn in currentColor so each button's neon colour comes from CSS. No external hosts.

const svg = (body, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  boost: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="currentColor" stroke-width="1.6"/>'),
  drift: svg('<path d="M4 17c3-1 4-4 6-4s2 3 4 3 3-3 6-4"/><path d="M4 12c2-.5 3-2 5-2"/><circle cx="17" cy="8" r="2.4" fill="currentColor" stroke="none"/>'),
  jump: svg('<path d="m6 14 6-6 6 6"/><path d="m6 20 6-6 6 6" opacity=".55"/><path d="M5 4h14"/>'),
  special: svg('<path d="m12 2.8 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" fill="currentColor" stroke-width="1.4"/>'),
  accel: svg('<path d="M12 3v14"/><path d="m6 9 6-6 6 6"/><path d="M7 21h10"/>'),
  horn: svg('<path d="M3 10v4h3l7 5V5L6 10H3Z" fill="currentColor" stroke-width="1.6"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  pause: svg('<path d="M8 5v14M16 5v14" stroke-width="3.4"/>'),
  rear: svg('<rect x="3" y="6" width="18" height="10" rx="5"/><path d="M12 16v4M8 20h8"/><path d="m10 9-2 2 2 2M8 11h7"/>'),
  camera: svg('<path d="M4 8h3l2-2.5h6L17 8h3v11H4Z"/><circle cx="12" cy="13" r="3.4"/>'),
  respawn: svg('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>'),
  recenter: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  zone: svg('<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'),
  agro: svg('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z" fill="currentColor" stroke-width="1.4"/>'),
  roar: svg('<path d="M4 12h2M8 7v10M12 4v16M16 7v10M20 10v4"/>'),
  chevron: svg('<path d="m8 15 4-4 4 4" stroke-width="3"/>'),
};

export const LABELS = {
  boost: 'WARP', drift: 'DRIFT', jump: 'JUMP', special: 'SPECIAL', accel: 'GAS', horn: 'HONK',
  pause: 'PAUSE', rear: 'LOOK BACK', camera: 'CAMERA', respawn: 'RESET',
};
