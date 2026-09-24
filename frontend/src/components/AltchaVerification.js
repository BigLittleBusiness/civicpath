import React, { useEffect, useRef, useState } from 'react';
import 'altcha';

export function AltchaVerification({ challengeUrl, onVerified }) {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const verifiedCallbackRef = useRef(onVerified);
  const [state, setState] = useState('loading');

  useEffect(() => { verifiedCallbackRef.current = onVerified; }, [onVerified]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const widget = document.createElement('altcha-widget');
    widget.setAttribute('challenge', challengeUrl);
    widget.setAttribute('auto', 'onload');
    widget.setAttribute('name', 'altcha');
    widget.setAttribute('theme', 'light');
    const handleVerified = (event) => { setState('verified'); verifiedCallbackRef.current?.(event.detail?.payload || ''); };
    const handleState = (event) => {
      const next = event.detail?.state || 'loading';
      setState(next);
      if (next !== 'verified') verifiedCallbackRef.current?.('');
    };
    widget.addEventListener('verified', handleVerified);
    widget.addEventListener('statechange', handleState);
    container.appendChild(widget);
    widgetRef.current = widget;
    return () => {
      widget.removeEventListener('verified', handleVerified);
      widget.removeEventListener('statechange', handleState);
      widget.remove();
    };
  }, [challengeUrl]);

  return <div className="altcha-verification"><div ref={containerRef}/><small className={state === 'verified' ? 'is-verified' : ''}>{state === 'verified' ? 'Verification complete.' : 'Completing a privacy-friendly verification check…'}</small></div>;
}
