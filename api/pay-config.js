// 결제창에 필요한 공개 키만 내려 준다(클라이언트 키). 시크릿 키는 절대 여기 넣지 않는다.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const clientKey = process.env.TOSS_CLIENT_KEY;
  if (!clientKey) return res.status(500).json({ error: '결제 설정이 아직 안 됐어요. 전화로 예약해 주세요.' });
  return res.status(200).json({ clientKey, test: clientKey.startsWith('test_') });
};
