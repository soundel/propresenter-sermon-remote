// 크롬(헤드리스)으로 준비 화면·설교 화면 캡처 → docs/images/
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const [, , BASE, OUTDIR, PROFILE] = process.argv;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SCRIPT = `# 서론
[[1]] 오늘 본문은 요한복음 3장입니다.
{{파랑: 요 3:16 / 하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니}}
[[2]] 하나님은 먼저 우리를 사랑하셨습니다.

# 본론
[[배경 2]] 그런데 우리는 이 사랑을 어떻게 알 수 있을까요?
{{사랑은 받은 만큼 흘러갑니다}}
[[3]] 받은 사랑은 다른 사람에게 흘러가야 합니다.
{{노랑: 오늘 내가 사랑을 흘려보낼 한 사람은 누구입니까?}}

# 결론
[[4]] 이번 주에 그 한 사람을 위해 기도해 봅시다.
[[지움]] 함께 기도하겠습니다.`;

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--lang=ko-KR', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 40 && !ws; i++) {
    await sleep(250);
    try { const t = await (await fetch('http://127.0.0.1:9333/json')).json(); const pg = t.find(x => x.type === 'page'); if (pg) ws = pg.webSocketDebuggerUrl; } catch {}
  }
  const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
  let id = 0; const wait = new Map();
  sock.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
  const cdp = (method, params = {}) => new Promise(r => { const n = ++id; wait.set(n, r); sock.send(JSON.stringify({ id: n, method, params })); }).then(m => { if (m.error) throw new Error(method + ': ' + m.error.message); return m.result; });
  const ev = async expr => (await cdp('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true })).result.value;
  const size = (w, h, mobile = false) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile });
  const shot = async (name, sel, pad = 0) => {
    const r = sel ? await ev(`const els=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>e.offsetParent);
      const a=els.map(e=>e.getBoundingClientRect()); const x=Math.min(...a.map(b=>b.left)), y=Math.min(...a.map(b=>b.top)+scrollY),
      r=Math.max(...a.map(b=>b.right)), b=Math.max(...a.map(b=>b.bottom))+scrollY; return {x,y:Math.min(...a.map(q=>q.top))+scrollY,w:r-x,h:b-(Math.min(...a.map(q=>q.top))+scrollY)}`) : null;
    const clip = r ? { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + pad * 2, height: r.h + pad * 2, scale: 1 } : undefined;
    const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!clip, ...(clip ? { clip } : {}) });
    fs.writeFileSync(path.join(OUTDIR, name), Buffer.from(data, 'base64')); console.log('  ·', name);
  };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

  // 1) 이 맥의 준비 화면 (예시 주소·비밀번호로 바꿔서)
  await size(1100, 900);
  await cdp('Page.navigate', { url: BASE }); await sleep(2500);
  const fake = `document.getElementById('infoAddr').textContent='http://192.168.0.10:8080';
    document.getElementById('infoPw').innerHTML='접속 비밀번호: <b style="font-size:20px;color:var(--text)">123456</b> — 처음 만들어진 비밀번호입니다. 맨 아래에서 바꿀 수 있습니다.'; document.getElementById('infoQuit').textContent='다시 켜려면 응용 프로그램의 "설교 리모컨"을 누르세요.';`;
  await ev(fake + `document.fonts && await document.fonts.ready;`);
  await shot('준비-접속카드.png', '#infoCard, #setup > h1, #setup > .lead', 24);
  await shot('준비-1-연결.png', '#setup .card:nth-of-type(2)', 16);

  // 2) 슬라이드·배경
  await ev(`await openPresPick(); await new Promise(r=>setTimeout(r,600));`);
  await shot('준비-2-목록.png', '#setup .card:nth-of-type(3)', 16);
  await ev(`await loadPres({uuid:'PR-1',name:'설교 — 받은 사랑'}); $('presPick').classList.add('hidden'); await loadMediaLists(); await loadMedia('MP-1'); await new Promise(r=>setTimeout(r,1200));`);
  await shot('준비-2-슬라이드.png', '#setup .card:nth-of-type(3)', 16);
  await shot('준비-3-배경.png', '#setup .card:nth-of-type(4)', 16);

  // 3) 원고 + 자막 틀
  await ev(`$('text').value=${JSON.stringify(SCRIPT)}; S.subs={}; await loadMsgs(true); renderSubs(); await new Promise(r=>setTimeout(r,500));`);
  await shot('준비-4-원고.png', '#setup .card:nth-of-type(5)', 16);
  await shot('준비-5-자막틀.png', '#setup .card:nth-of-type(6)', 16);

  // 4) 아이패드(가로) 설교 화면
  await size(1180, 820, true);
  await ev(`startPreach(); await new Promise(r=>setTimeout(r,300)); go(1); go(1); await new Promise(r=>setTimeout(r,1500));`);
  await ev(`$('timer').textContent='12:34'; document.querySelectorAll('#clock,.clock').forEach(e=>e.textContent='11:20');`);
  await shot('설교화면.png');
  await ev(`toggleDark(); await new Promise(r=>setTimeout(r,500)); $('timer').textContent='12:34';`);
  await shot('설교화면-어둡게.png');
  await ev(`toggleDark();`);

  // 5) 아이패드 로그인 화면
  await ev(`document.querySelectorAll('body > div').forEach(d=>d.classList.add('hidden')); $('login').classList.remove('hidden');`);
  await shot('로그인.png');

  sock.close(); chrome.kill();
})().catch(e => { console.error(e); process.exit(1); });
