import React from 'react';
export function ChartCard({ eyebrow, title, action, children, className = '' }) {
  return <section className={`chart-card ${className}`}><div className="chart-card-head"><div>{eyebrow && <p className="card-eyebrow">{eyebrow}</p>}<h3>{title}</h3></div>{action}</div>{children}</section>;
}

