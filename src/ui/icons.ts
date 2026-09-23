const line = (d: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONS: Record<string, string> = {
  pause:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.6" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.6" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>',
  settings: line('<path d="M4 7h9M17.8 7H20M4 17h2.2M11 17h9"/><circle cx="15.4" cy="7" r="2.4"/><circle cx="8.6" cy="17" r="2.4"/>'),
  home: line('<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>'),
  share: line('<path d="M12 14.5V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"/>'),
  replay: line('<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5V9H9"/>'),
  palette: line(
    '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1-.8-1.4-.8-2.3 0-1 .8-1.7 1.8-1.7h2.1a4.1 4.1 0 0 0 4.1-4.1C21 6.9 17 3.5 12 3.5z"/><circle cx="7.6" cy="11" r="1.2" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.3" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="7.6" r="1.2" fill="currentColor" stroke="none"/>',
  ),
  target: line('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>'),
  gift: line(
    '<rect x="3.5" y="8" width="17" height="4.5" rx="1"/><path d="M5 12.5V20h14v-7.5M12 8v12"/><path d="M12 8C10.5 4.2 6 3.8 6 6.4 6 8 9 8 12 8zM12 8c1.5-3.8 6-4.2 6-1.6C18 8 15 8 12 8z"/>',
  ),
  close: line('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  music: line('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  sound: line('<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  vibrate: line('<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4.5 9v6M19.5 9v6"/>'),
  motion: line('<path d="M3.5 12h3l2.5-6 4.5 12 2.5-6h4.5"/>'),
  help: line('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5"/><circle cx="12" cy="16.7" r=".8" fill="currentColor" stroke="none"/>'),
  lock: line('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  check: line('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  fire: line('<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.2 2.4-5 3.6-7.9.6 1.8 1.6 2.8 2.7 3.4-.2-2.7.9-5.2 3.2-6.9-.1 3 1.4 4.5 2.6 6.2 1 1.4 1.4 2.8 1.4 4.6C19 18.3 16 21 12 21z"/>'),
  flag: line('<path d="M5 21V4M5 4.5h11.5l-2 4 2 4H5"/>'),
};

export function hydrateIcons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    const svg = ICONS[el.dataset.icon ?? ''];
    if (svg && !el.querySelector('svg')) el.insertAdjacentHTML('afterbegin', svg);
  });
}
