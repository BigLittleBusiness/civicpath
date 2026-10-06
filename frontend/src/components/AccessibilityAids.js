import React, { useEffect } from 'react';

export function RouteAnnouncer() {
  useEffect(() => { document.documentElement.classList.add('civicpath-accessibility-ready'); return () => document.documentElement.classList.remove('civicpath-accessibility-ready'); }, []);
  return <a className="skip-link" href="#main-content">Skip to main content</a>;
}
