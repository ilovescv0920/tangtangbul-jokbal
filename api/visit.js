// 방문 한 번 기록 — 개인정보 없이 유입 채널만 남긴다.
const { clean, channelOf } = require('./_channel');
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sbHeaders = () => ({
  apikey: SB_KEY,
  ...(String(SB_KEY).startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY}` } : {}),
  'Content-Type': 'application/json',
});
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });
  if (!SB_URL || !SB_KEY) return res.status(204).end();
  if (BOT.test(req.headers['user-agent'] || '')) return res.status(204).end();
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  const a = clean(b);
  const row = { channel: channelOf(a), source: a.source || null, medium: a.medium || null, campaign: a.campaign || null, ref_host: a.ref_host || null };
  await fetch(`${SB_URL}/rest/v1/visits`, { method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(row) }).catch(() => {});
  return res.status(204).end();
};
