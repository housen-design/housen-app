// 用法：node server.js <port> <backend Code.gs>
const http=require('http');
const [port,backend]=process.argv.slice(2);
const H=require('./harness')(backend);
let fail=false;const log=[];let delays=[];   // 模擬某個請求比較慢回來
http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.url.startsWith('/fcreate')){globalThis.FAIL_CREATE=req.url.includes('on');res.end('ok');return;}
  if(req.url.startsWith('/fail')){fail=req.url.includes('on');res.end('fail='+fail);return;}
  if(req.url.startsWith('/delay')){const q=new URL(req.url,'http://x').searchParams;if(q.get('clear'))delays=[];else delays.push({action:q.get('action'),id:q.get('id')||'',ms:+q.get('ms')});res.end('ok');return;}
  if(req.url.startsWith('/log')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(log));return;}
  if(req.url.startsWith('/clearlog')){log.length=0;res.end('ok');return;}
  if(req.url.startsWith('/table')){const n=decodeURIComponent(req.url.split('=')[1]);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(H.T[n]));return;}
  if(req.method!=='POST'){res.end('ok');return;}
  let b='';req.on('data',d=>b+=d);req.on('end',()=>{
    if(fail){req.socket.destroy();return;}
    let out;try{const r=JSON.parse(b);log.push({action:r.action,as:(r.payload||{}).as||'',who:r.token});
      if(r.action==='thumbs') out={ok:true,data:{}};
      else out={ok:true,data:H.run(r.token,r.action,r.payload||{})};
    }catch(e){out={ok:false,error:String(e&&e.message||e)}}
    let wait=0;try{const r=JSON.parse(b);const d=delays.find(x=>x.action===r.action&&(!x.id||x.id===((r.payload||{}).id||(r.payload||{}).caseId)));if(d)wait=d.ms;}catch(e){}
    setTimeout(()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(out));},wait);});
}).listen(+port,()=>console.log('api',port));
