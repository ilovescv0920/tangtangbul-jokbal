// 한 번만 쓰는 표 고치기 통로(결제 칸 추가) — 끝나면 이 파일은 지운다. 데이터는 읽지도 보내지도 않는다.
const { Client } = require('pg');
const SQL = `
alter table public.inquiries add column if not exists order_id text;
alter table public.inquiries add column if not exists payment_status text not null default 'none';
alter table public.inquiries add column if not exists payment_key text;
alter table public.inquiries add column if not exists pay_method text;
alter table public.inquiries add column if not exists paid_at timestamptz;
alter table public.inquiries add column if not exists refunded_at timestamptz;
do $$ begin
  alter table public.inquiries add constraint inquiries_payment_status_check check (payment_status in ('none','pending','paid','refunded','failed'));
exception when duplicate_object then null; end $$;
create unique index if not exists inquiries_order_id_key on public.inquiries (order_id);
notify pgrst, 'reload schema';
`;
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) return res.status(500).json({ error: '데이터베이스 연결 정보가 없어요.' });
  const client = new Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
  try {
    await client.connect(); await client.query(SQL);
    const rls = await client.query("select relname, relrowsecurity from pg_class where relname = 'inquiries' and relnamespace = 'public'::regnamespace");
    return res.status(200).json({ ok: true, rls: rls.rows });
  }
  catch (e) { return res.status(500).json({ error: '표를 고치지 못했어요', detail: String(e.message).slice(0, 200) }); }
  finally { await client.end().catch(() => {}); }
};
