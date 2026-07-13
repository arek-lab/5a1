export type AnalyticsEvent =
  | { name: 'hotel_login'; properties: Record<string, never> }
  | { name: 'hotel_settings_updated'; properties: { area: 'profile' | 'services' | 'knowledge' } }
  | { name: 'guest_qr_scanned'; properties: { qr_type: 'reception' | 'room' } }
  | { name: 'guest_session_returned'; properties: Record<string, never> }
  // Reserved — S2.6 orders inbox, no host code yet.
  | { name: 'guest_order_received'; properties: Record<string, never> }
  // Reserved — S3.2 guest order flow, no host code yet.
  | { name: 'guest_item_details_opened'; properties: Record<string, never> }
  // Reserved — S2.6/S3.2 guest order flow, no host code yet.
  | { name: 'guest_order_submitted'; properties: Record<string, never> }
  // Reserved — S4.2 AI Concierge, no host code yet.
  | { name: 'concierge_query_submitted'; properties: Record<string, never> }
  // Reserved — S4.2 AI Concierge, no host code yet.
  | { name: 'concierge_response_delivered'; properties: { confidence: number; latency_ms: number } }
  | { name: 'concierge_response_escalated'; properties: { reason: 'complaint' | 'streak' } };
