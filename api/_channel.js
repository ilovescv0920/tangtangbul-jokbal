// 유입 채널 정리 — utm_source가 있으면 그것을, 없으면 들어온 사이트 주소로 판단한다.
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

const HOSTS = [
  [/(^|\.)naver\.(com|me)$/, 'naver'],
  [/(^|\.)daum\.net$|(^|\.)kakao\.com$/, 'kakao'],
  [/(^|\.)google\./, 'google'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, 'facebook'],
  [/(^|\.)baemin\.com$|(^|\.)baemin\.app$/, 'baemin'],
  [/(^|\.)coupangeats\.com$|(^|\.)coupang\.com$/, 'coupangeats'],
];

function clean(a = {}) {
  const lower = (v, n) => clip(v, n).toLowerCase().replace(/[^a-z0-9_.\-가-힣]/g, '');
  return {
    source: lower(a.source, 40),
    medium: lower(a.medium, 40),
    campaign: lower(a.campaign, 60),
    content: lower(a.content, 60),
    term: clip(a.term, 60),
    ref_host: lower(a.ref_host, 80),
  };
}

function channelOf(a) {
  if (a.source) return a.source;
  if (a.ref_host) {
    for (const [re, ch] of HOSTS) if (re.test(a.ref_host)) return ch;
    return a.ref_host;
  }
  return 'direct';
}

module.exports = { clean, channelOf };
