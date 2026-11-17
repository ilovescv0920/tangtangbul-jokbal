// 결제 승인 — 저장해 둔 주문 금액과 같은지 확인한 뒤에만 토스에 승인을 요청한다.
const { toss, hasKey } = require('./_toss');
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sbHeaders = () => ({
  apikey: SB_KEY,
  ...(String(SB_KEY).startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY}` } : {}),
  'Content-Type': 'application/json',
});
const METHOD = { '카드': '카드', '간편결제': '간편결제', '계좌이체': '계좌이체', '휴대폰': '휴대폰', '가상계좌': '가상계좌' };
const summary = (o) => ({ pickup_date: o.pickup_date, pickup_time: o.pickup_time, message: o.message, total: o.total, method: o.pay_method });

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });
  if (!SB_URL || !SB_KEY || !hasKey()) return res.status(500).json({ error: '결제 설정이 아직 안 됐어요. 가게에 전화해 주세요.' });
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  const orderId = String(b.orderId || '').slice(0, 64);
  const paymentKey = String(b.paymentKey || '').slice(0, 200);
  const amount = Number(b.amount);
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(orderId) || !paymentKey || !Number.isInteger(amount)) return res.status(400).json({ error: '결제 정보가 올바르지 않아요.' });

  const q = await fetch(`${SB_URL}/rest/v1/inquiries?order_id=eq.${orderId}&select=*`, { headers: sbHeaders() });
  const order = q.ok ? (await q.json())[0] : null;
  if (!order) return res.status(404).json({ error: '주문을 찾지 못했어요. 가게에 전화해 주세요.' });
  if (order.payment_status === 'paid') return res.status(200).json({ ok: true, order: summary(order) }); // 새로고침해도 같은 결과
  if (order.payment_status !== 'pending') return res.status(400).json({ error: '이미 처리된 주문이에요.' });
  if (order.total !== amount) return res.status(400).json({ error: '결제 금액이 주문 금액과 달라요. 다시 예약해 주세요.' });

  const t = await toss('/payments/confirm', { paymentKey, orderId, amount }, `confirm-${orderId}`);
  if (!t.ok) {
    if (t.data.code === 'ALREADY_PROCESSED_PAYMENT') {
      // 승인은 됐는데 저장 전에 끊긴 경우 — 아래에서 다시 저장한다
    } else {
      return res.status(400).json({ error: t.data.message || '결제를 승인하지 못했어요. 다시 시도해 주세요.' });
    }
  }
  const p = t.data || {};
  const patch = {
    payment_status: 'paid', payment_key: paymentKey,
    pay_method: METHOD[p.method] || p.method || null,
    paid_at: p.approvedAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const u = await fetch(`${SB_URL}/rest/v1/inquiries?order_id=eq.${orderId}`, { method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
  if (!u.ok) return res.status(500).json({ error: '결제는 됐지만 예약 저장에 실패했어요. 가게에 전화해 주세요.' });
  return res.status(200).json({ ok: true, order: summary({ ...order, ...patch }) });
};
