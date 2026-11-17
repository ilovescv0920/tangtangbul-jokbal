// 한 번만 쓰는 표 고치기 통로(유입 채널 칸·방문 표 추가) — 끝나면 이 파일은 지운다. 데이터는 읽지도 보내지도 않는다.
const { Client } = require('pg');
const SQL = `
alter table public.inquiries add column if not exists utm jsonb;
alter table public.inquiries add column if not exists channel text;
create table if not exists public.visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  channel text not null,
  source text,
  medium text,
  campaign text,
  ref_host text
);
create index if not exists visits_created_at_idx on public.visits (created_at);
alter table public.visits enable row level security;
revoke all on public.visits from anon, authenticated;
notify pgrst, 'reload schema';
`;
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) return res.status(500).json({ error: '데이터베이스 연결 정보가 없어요.' });
  const client = new Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
  try {
    await client.connect(); await client.query(SQL);
    const rls = await client.query("select relname, relrowsecurity from pg_class where relname in ('inquiries','visits') and relnamespace = 'public'::regnamespace");
    return res.status(200).json({ ok: true, rls: rls.rows });
  }
  catch (e) { return res.status(500).json({ error: '표를 고치지 못했어요', detail: String(e.message).slice(0, 200) }); }
  finally { await client.end().catch(() => {}); }
};
