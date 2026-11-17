// 관리자: 비밀번호 확인 + 예약 목록 + 상태 바꾸기. 비밀번호·키는 환경변수로만 읽는다.
const crypto = require('node:crypto');
const { toss, hasKey } = require('./_toss');
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sbHeaders = () => ({
  apikey: SB_KEY,
  ...(String(SB_KEY).startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY}` } : {}),
  'Content-Type': 'application/json',
});
const same = (a, b) => {
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};
// 화면에서는 새 예약 → 확인함 → 픽업 완료 로 보인다
const STATUSES = ['새 문의', '연락함', '완료'];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return res.status(500).json({ error: 'Vercel 환경변수에 ADMIN_PASSWORD를 넣고 Redeploy 해 주세요.' });
  if (!same(req.headers['x-admin-password'] || '', pass)) return res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Supabase 연결 정보가 없어요.' });

  if (req.method === 'GET' && req.query && req.query.view === 'channels') {
    // 최근 30일 유입 채널별 방문·예약 수
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [v, i] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/visits?select=channel&created_at=gte.${since}&limit=50000`, { headers: sbHeaders() }),
      fetch(`${SB_URL}/rest/v1/inquiries?select=channel&created_at=gte.${since}&payment_status=not.in.(pending,failed)&limit=50000`, { headers: sbHeaders() }),
    ]);
    if (!v.ok || !i.ok) return res.status(500).json({ error: '유입 채널을 불러오지 못했어요.' });
    const map = {};
    for (const r of await v.json()) (map[r.channel || 'direct'] ||= { visits: 0, reservations: 0 }).visits++;
    for (const r of await i.json()) (map[r.channel || 'direct'] ||= { visits: 0, reservations: 0 }).reservations++;
    const channels = Object.entries(map).map(([channel, c]) => ({ channel, ...c })).sort((a, b) => b.visits - a.visits || b.reservations - a.reservations);
    return res.status(200).json({ channels });
  }
  if (req.method === 'GET') {
    const r = await fetch(`${SB_URL}/rest/v1/inquiries?select=*&order=created_at.desc&limit=500`, { headers: sbHeaders() });
    if (!r.ok) return res.status(500).json({ error: '불러오지 못했어요.' });
    return res.status(200).json({ rows: await r.json() });
  }
  if (req.method === 'PATCH') {
    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    const id = Number(b.id);
    if (Number.isInteger(id) && b.action === 'refund') {
      // 환불 — 결제 완료된 예약만, 토스에 결제 취소를 요청한 뒤 저장한다
      if (!hasKey()) return res.status(500).json({ error: '결제 설정이 안 돼 있어요.' });
      const q = await fetch(`${SB_URL}/rest/v1/inquiries?id=eq.${id}&select=id,payment_status,payment_key`, { headers: sbHeaders() });
      const o = q.ok ? (await q.json())[0] : null;
      if (!o || o.payment_status !== 'paid' || !o.payment_key) return res.status(400).json({ error: '환불할 수 있는 결제가 아니에요.' });
      const reason = String(b.reason || '가게에서 예약 취소').slice(0, 200);
      const t = await toss(`/payments/${encodeURIComponent(o.payment_key)}/cancel`, { cancelReason: reason }, `refund-${id}`);
      if (!t.ok && t.data.code !== 'ALREADY_CANCELED_PAYMENT') return res.status(400).json({ error: t.data.message || '환불하지 못했어요.' });
      const now = new Date().toISOString();
      const u = await fetch(`${SB_URL}/rest/v1/inquiries?id=eq.${id}`, { method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify({ payment_status: 'refunded', refunded_at: now, updated_at: now }) });
      if (!u.ok) return res.status(500).json({ error: '환불은 됐지만 저장하지 못했어요. 새로고침해 주세요.' });
      return res.status(200).json({ ok: true });
    }
    if (!Number.isInteger(id) || !STATUSES.includes(b.status)) return res.status(400).json({ error: '잘못된 요청이에요.' });
    const r = await fetch(`${SB_URL}/rest/v1/inquiries?id=eq.${id}`, {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: b.status, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) return res.status(500).json({ error: '바꾸지 못했어요.' });
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: '지원하지 않는 요청이에요.' });
};
