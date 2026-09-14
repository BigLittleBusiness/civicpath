import React from 'react';

const paths = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  folder: <><path d="M3 6.5h6l2 2h10v10.2A2.3 2.3 0 0 1 18.7 21H5.3A2.3 2.3 0 0 1 3 18.7V6.5Z"/><path d="M3 9h18"/></>,
  fund: <><path d="M5 7h14M7 4v3m10-3v3M6 7v12h12V7"/><path d="M9 12h6m-3-3v6"/></>,
  check: <><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
  report: <><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h4M8 13h8M8 17h5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.3 1A7.4 7.4 0 0 0 15 6l-.3-2.6h-4L10.4 6a7 7 0 0 0-1.5.9l-2.3-1-2 3.5L6.8 11a7 7 0 0 0 0 2l-2.2 1.5 2 3.5 2.3-1a7.4 7.4 0 0 0 1.5.9l.3 2.6h4l.3-2.6a7 7 0 0 0 1.5-.9l2.3 1 2-3.5-2.2-1.5c.1-.3.1-.7.1-1Z"/></>,
  arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6"/><path d="m16 16 4.5 4.5"/></>,
  bell: <><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4"/></>,
  upload: <><path d="M12 16V4m0 0L8 8m4-4 4 4"/><path d="M5 15v4h14v-4"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  external: <><path d="M14 4h6v6M11 13l9-9M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></>,
};

export function Icon({ name, size = 18, stroke = 1.8 }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.grid}</svg>;
}
