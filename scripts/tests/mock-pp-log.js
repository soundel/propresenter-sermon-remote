// 메시지 켜짐 상태를 기록하는 가짜 ProPresenter (응답을 조금 늦게: 실제처럼)
const http=require('http');const active=new Set();const log=[];
const msgs=['L','R','V','A'].map(u=>({id:{uuid:u,name:u},tokens:[{name:'t',text:{text:''}}]}));
http.createServer(async(req,res)=>{const p=new URL(req.url,'http://x').pathname;let m;
 await new Promise(r=>setTimeout(r,60+Math.random()*120));
 if(p==='/version'){res.end('{"name":"mock"}');return}
 if(p==='/v1/messages'){res.end(JSON.stringify(msgs));return}
 if(p==='/state'){res.end(JSON.stringify({active:[...active],log}));log.length=0;return}
 if((m=/^\/v1\/message\/(\w+)\/trigger$/.exec(p))){active.add(m[1]);log.push('+'+m[1])}
 else if((m=/^\/v1\/message\/(\w+)\/clear$/.exec(p))){active.delete(m[1]);log.push('-'+m[1])}
 else if(p==='/v1/clear/layer/messages'){active.clear();log.push('-ALL')}
 else log.push(p.replace('/v1/',''));
 res.writeHead(204);res.end()}).listen(51998);
