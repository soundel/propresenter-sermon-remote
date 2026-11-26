// 화면 캡처용 가짜 ProPresenter (예시 데이터만)
const http = require('http');
const PORT = +process.argv[2] || 51999;
const slides = [
  ['', '요한복음 3장 16절', '#2f6b4f'], ['', '하나님의 사랑', '#3f7d5c'], ['', '받은 사랑, 흘러가는 사랑', '#56836b'],
  ['', '오늘의 질문', '#4d6f8f'], ['', '함께 기도합니다', '#6a5d8f'],
];
const bgs = [['기본 배경', '#20352b', '#3f7d5c'], ['하늘', '#3c6ea8', '#a9d1f0'], ['저녁', '#4a2f45', '#d58a5c']];
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const slideSvg = i => { const [, t, c] = slides[i] || ['', '', '#333'];
  return svg(400, 225, `<rect width="400" height="225" fill="${c}"/><text x="200" y="122" font-family="-apple-system,Apple SD Gothic Neo,sans-serif" font-size="26" font-weight="600" fill="#fff" text-anchor="middle">${t}</text>`); };
const bgSvg = i => { const [, a, b] = bgs[i] || bgs[0];
  return svg(400, 225, `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="225" fill="url(#g)"/>`); };
const tok = (name, text) => ({ name, uuid: 'T-' + name, text: { text } });
const messages = [
  { id: { name: '자막 기본', index: 0, uuid: 'MSG-0' }, tokens: [tok('문구', '')] },
  { id: { name: '파랑 성경', index: 1, uuid: 'MSG-1' }, tokens: [tok('주소', ''), tok('본문', '')] },
  { id: { name: '노랑 강조', index: 2, uuid: 'MSG-2' }, tokens: [tok('문구', '')] },
];
const J = (res, o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  let m;
  if (p === '/version') return J(res, { name: '방송실-Mac', platform: 'mac', host_description: 'ProPresenter 22.0.1', api_version: 'v1' });
  if (p === '/v1/playlists') return J(res, [{ id: { uuid: 'PL-1', name: '주일 예배', index: 0 }, field_type: 'playlist', children: [] }]);
  if (p === '/v1/playlist/PL-1') return J(res, { id: { uuid: 'PL-1', name: '주일 예배' }, items: [
    { id: { uuid: 'I1', name: '예배로 부름' }, type: 'presentation', presentation_info: { presentation_uuid: 'PR-0' } },
    { id: { uuid: 'I2', name: '설교 — 받은 사랑' }, type: 'presentation', presentation_info: { presentation_uuid: 'PR-1' } },
    { id: { uuid: 'I3', name: '광고' }, type: 'presentation', presentation_info: { presentation_uuid: 'PR-2' } }] });
  if (p === '/v1/libraries') return J(res, [{ uuid: 'LIB-1', name: '기본', index: 0 }]);
  if (p === '/v1/library/LIB-1') return J(res, { items: [{ uuid: 'PR-1', name: '설교 — 받은 사랑' }] });
  if ((m = /^\/v1\/presentation\/[^/]+\/thumbnail\/(\d+)$/.exec(p))) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return res.end(slideSvg(+m[1])); }
  if (/^\/v1\/presentation\/(focused|active)$/.test(p)) return J(res, { presentation: { id: { uuid: 'PR-1', name: '설교 — 받은 사랑' } } });
  if (/^\/v1\/presentation\/[^/]+$/.test(p)) return J(res, { presentation: { id: { uuid: 'PR-1', name: '설교 — 받은 사랑' },
    groups: [{ name: '설교', slides: slides.map(s => ({ text: s[1], label: '' })) }] } });
  if (p === '/v1/messages') return J(res, messages);
  if (p === '/v1/media/playlists') return J(res, [{ id: { uuid: 'MP-1', name: '설교 배경' }, children: [] }]);
  if (p === '/v1/media/playlist/MP-1') return J(res, { id: { uuid: 'MP-1', name: '설교 배경' }, items: bgs.map((b, i) => ({ id: { uuid: 'BG-' + i, name: b[0] } })) });
  if ((m = /^\/v1\/media\/BG-(\d+)\/thumbnail$/.exec(p))) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return res.end(bgSvg(+m[1])); }
  res.writeHead(204); res.end();   // trigger / clear 등
}).listen(PORT, '127.0.0.1', () => console.log('mock pp on', PORT));
