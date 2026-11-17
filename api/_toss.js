// 토스페이먼츠 서버 호출 — 시크릿 키는 환경변수(TOSS_SECRET_KEY)로만 읽는다.
const auth = () => 'Basic ' + Buffer.from(`${process.env.TOSS_SECRET_KEY || ''}:`).toString('base64');

async function toss(path, body, idempotencyKey) {
  const r = await fetch(`https://api.tosspayments.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

module.exports = { toss, hasKey: () => Boolean(process.env.TOSS_SECRET_KEY) };
