import React from 'react';
import { useAuth } from '../features/AuthContext';
import { ReliableNotificationDeliveryPanel } from './ReliableNotificationDeliveryPanel';

export const deliveryOutcomeLabel = (status) => status === 'sent' || status === 'accepted' ? 'Provider accepted — inbox delivery not confirmed' : status === 'delivered' ? 'Provider delivery event — not proof of read' : status === 'uncertain' ? 'Acceptance uncertain — never replay' : status;

export function NotificationDeliveryPanel() {
  const { user } = useAuth();
  if (user?.role === 'org_admin') return <ReliableNotificationDeliveryPanel/>;
  if (user?.role !== 'platform_admin') return null;
  // Tenant outcome APIs require a current organisation administrator, never an operations-only identity.
  return <section className="admin-section"><div className="admin-card delivery-monitor"><div className="admin-card-head"><div><p className="card-eyebrow">Transactional email boundaries</p><h3>Message outcomes and secure regeneration</h3><p className="admin-copy">Council notification outcomes are available to that Council’s Organisation Administrator under Workspace settings → Notifications. Platform operations does not request tenant notification APIs or expose historical security content.</p></div></div><dl><dt>Accepted (including legacy “sent”)</dt><dd>Provider accepted the message; inbox delivery is not confirmed.</dd><dt>Delivered</dt><dd>A verified provider delivery event, not evidence of inbox placement or a person reading it.</dd><dt>Disabled, failed or uncertain</dt><dd>Do not replay old reset or invitation content. Use the original account recovery or invitation regeneration flow to create a fresh single-use link after reviewing the outcome.</dd></dl><p>No raw tokens, message bodies or replay controls are exposed. This panel does not certify provider configuration, signed-feedback commissioning or live sending.</p></div></section>;
}
