// 포장 예약 받기 — 서버 키는 환경변수로만 읽는다. 값은 코드에 적지 않는다.
const crypto = require('node:crypto');
const { clean, channelOf } = require('./_channel');
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const sbHeaders = () => ({
  apikey: SB_KEY,
  ...(String(SB_KEY).startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY}` } : {}),
  'Content-Type': 'application/json',
});

// 가격은 서버가 정한다(손님 화면 값은 믿지 않는다)
const MENU = {
  jokbal_s: { name: '족발 小', price: 10000 },
  jokbal_l: { name: '족발 大', price: 15000 },
  gamjatang_s: { name: '감자탕 小', price: 6000 },
  gamjatang_l: { name: '감자탕 大', price: 10000 },
};
const SLOTS = ['13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30'];

const seoulNow = () => {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), mins: d.getUTCHours() * 60 + d.getUTCMinutes() };
};
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: '예약을 저장할 곳이 아직 연결되지 않았어요. 전화로 예약해 주세요.' });

  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  if (b.website) return res.status(200).json({ ok: true }); // 스팸 함정 칸

  const name = clip(b.name, 50);
  const contact = clip(b.contact, 20);
  if (!name || contact.replace(/\D/g, '').length < 9) return res.status(400).json({ error: '이름과 연락받을 전화번호를 적어 주세요.' });
  if (b.consent !== true) return res.status(400).json({ error: '개인정보 수집·이용에 동의해 주세요.' });

  // 메뉴
  const items = {};
  let total = 0;
  for (const [id, n] of Object.entries(b.items || {})) {
    const q = Number(n);
    if (!MENU[id] || !Number.isInteger(q) || q < 1 || q > 20) continue;
    items[id] = q;
    total += MENU[id].price * q;
  }
  if (!Object.keys(items).length) return res.status(400).json({ error: '메뉴를 하나 이상 골라 주세요.' });

  // 픽업 날짜·시간 (서울 기준, 일요일 휴무, 오늘은 30분 뒤부터, 14일 안)
  const date = clip(b.pickup_date, 10);
  const time = clip(b.pickup_time, 5);
  const now = seoulNow();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < now.date || date > addDays(now.date, 14)) return res.status(400).json({ error: '픽업 날짜를 다시 골라 주세요.' });
  if (new Date(date + 'T00:00:00Z').getUTCDay() === 0) return res.status(400).json({ error: '일요일은 쉬어요. 다른 날을 골라 주세요.' });
  if (!SLOTS.includes(time)) return res.status(400).json({ error: '픽업 시간을 다시 골라 주세요.' });
  const [h, m] = time.split(':').map(Number);
  if (date === now.date && h * 60 + m < now.mins + 30) return res.status(400).json({ error: '그 시간은 지났거나 너무 가까워요. 다른 시간을 골라 주세요.' });

  const lines = Object.entries(items);
  const message = lines.map(([id, q]) => `${MENU[id].name} ${q}개`).join(', ');
  const orderName = lines.length > 1 ? `${MENU[lines[0][0]].name} 외 ${lines.length - 1}건` : `${MENU[lines[0][0]].name} ${lines[0][1]}개`;
  const utm = clean(b.attr || {});
  // 결제 전 주문 — 결제가 끝나야 예약함에 '새 예약'으로 보인다
  const orderId = `TT${date.replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const row = {
    name, contact, message, items, total, pickup_date: date, pickup_time: time, consent: true, utm, channel: channelOf(utm),
    order_id: orderId, payment_status: 'pending',
  };

  const r = await fetch(`${SB_URL}/rest/v1/inquiries`, { method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  if (!r.ok) return res.status(500).json({ error: '예약을 저장하지 못했어요. 잠시 뒤 다시 시도하거나 전화로 예약해 주세요.' });
  return res.status(200).json({ ok: true, orderId, orderName, amount: total, sameDay: date === now.date });
};
