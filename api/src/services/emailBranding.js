import { env } from '../config/env.js';

export const quartermark = Object.freeze({
  charcoal: '#040404',
  deepTeal: '#163133',
  green: '#0D6A55',
  orange: '#CD7C4E',
  paper: '#F7F6F1',
  bodyText: '#263D3D',
  muted: '#5D6E6C',
  line: '#D8E2DF',
});

export function escapeEmailHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function frontendOrigin() {
  const fallback = env.isProduction ? 'https://app.civicpath.com.au' : 'http://localhost:3000';
  try {
    const parsed = new URL(env.frontendUrl);
    if (['https:', 'http:'].includes(parsed.protocol)) return parsed.origin;
  } catch {
    // A safe absolute fallback keeps email markup usable if a non-production value is malformed.
  }
  return fallback;
}

export function quartermarkLogoUrl() {
  return `${frontendOrigin()}/civicpath-quartermark.png`;
}

function emailHref(value) {
  try {
    const parsed = new URL(String(value));
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.toString() : '#';
  } catch {
    return '#';
  }
}

export function emailButton({ href, label }) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0"><tr><td bgcolor="${quartermark.green}" style="border-radius:6px"><a href="${escapeEmailHtml(emailHref(href))}" style="display:inline-block;padding:13px 18px;border:1px solid ${quartermark.green};border-radius:6px;background:${quartermark.green};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1;text-decoration:none">${escapeEmailHtml(label)}</a></td></tr></table>`;
}

export function emailCallout({ title, contentHtml }) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0"><tr><td style="padding:18px 20px;border-left:4px solid ${quartermark.orange};background:#FCF0E9"><p style="margin:0 0 7px;color:${quartermark.green};font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:.07em;line-height:1.3;text-transform:uppercase">${escapeEmailHtml(title)}</p><div style="color:${quartermark.bodyText};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55">${contentHtml}</div></td></tr></table>`;
}

export function brandedEmail({ heading, contentHtml, preheader = '' }) {
  const safeHeading = escapeEmailHtml(heading);
  const safePreheader = escapeEmailHtml(preheader || heading);
  const logoUrl = escapeEmailHtml(quartermarkLogoUrl());
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:${quartermark.paper}"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;mso-hide:all">${safePreheader}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${quartermark.paper}"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;overflow:hidden"><tr><td align="left" style="padding:24px 32px 14px;border-bottom:4px solid ${quartermark.green};background:${quartermark.charcoal}"><img src="${logoUrl}" width="112" height="104" alt="CivicPath" style="display:block;width:112px;height:auto;border:0;outline:none;text-decoration:none"></td></tr><tr><td style="padding:0 32px 26px;background:${quartermark.deepTeal};color:#ffffff"><p style="margin:0 0 8px;color:${quartermark.orange};font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:.09em;line-height:1.3;text-transform:uppercase">CivicPath</p><h1 style="margin:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:700;letter-spacing:-.02em;line-height:1.2">${safeHeading}</h1></td></tr><tr><td style="padding:30px 32px;background:#ffffff;color:${quartermark.bodyText};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55">${contentHtml}</td></tr><tr><td style="padding:18px 32px;border-top:1px solid ${quartermark.line};background:#ffffff;color:${quartermark.muted};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5">CivicPath supports councils to connect strategy, delivery and evidence with greater confidence.</td></tr></table></td></tr></table></body></html>`;
}
