const {spawn}=require('child_process');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const [, , PROFILE, GAP]=process.argv;
(async()=>{const c=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-port=9335','--user-data-dir='+PROFILE,'about:blank'],{stdio:'ignore'});
let ws;for(let i=0;i<40&&!ws;i++){await sleep(250);try{const t=await(await fetch('http://127.0.0.1:9335/json')).json();ws=t.find(x=>x.type==='page')?.webSocketDebuggerUrl}catch{}}
const s=new WebSocket(ws);await new Promise(r=>s.onopen=r);let id=0;const w=new Map();s.onmessage=e=>{const m=JSON.parse(e.data);if(w.has(m.id)){w.get(m.id)(m);w.delete(m.id)}};
const cdp=(m,p={})=>new Promise(r=>{const n=++id;w.set(n,r);s.send(JSON.stringify({id:n,method:m,params:p}))});
const ev=async e=>(await cdp('Runtime.evaluate',{expression:`(async()=>{${e}})()`,awaitPromise:true,returnByValue:true})).result.result.value;
await cdp('Page.navigate',{url:process.argv[4]||'http://127.0.0.1:8091/'});await sleep(2500);
await ev(`S.subs={'기본':{uuid:'L',also:'R'},'파랑':{uuid:'V',ref:'A'},'초록':{uuid:'L',also:'R',ref:'A'}};
 $('text').value="{{양쪽}}\\n{{파랑: 마 16:15 / 본문}}\\n{{초록: 마 16:16 / 본문2}}\\n[[지움]]"; startPreach();`);
await fetch('http://127.0.0.1:51998/state');
const n=await ev(`return cues.length`);
for(let i=0;i<n;i++){await ev(`go(1)`);await sleep(+GAP);}
await sleep(2500);
console.log('간격',GAP+'ms →',JSON.stringify(await(await fetch('http://127.0.0.1:51998/state')).json()));
s.close();c.kill()})();
