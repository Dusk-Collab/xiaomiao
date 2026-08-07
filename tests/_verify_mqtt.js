// 验证 EMQX 公共 broker 的 MQTT-over-WebSocket 能否连上并 pub/sub 通
const WebSocket = require('ws');

function buildConnect(clientId, keepAlive) {
  const pb = strBytes(clientId);
  // variable header: protocol name MQTT(4) + level 4 + flags + keepalive(2)
  const vh = [0x00,0x04,0x4d,0x51,0x54,0x54,0x04,0x02, (keepAlive>>8)&0xff, keepAlive&0xff];
  const payload = [(pb.length>>8)&0xff, pb.length&0xff, ...pb];
  return packet(0x10, [...vh, ...payload]);
}
function buildSubscribe(pid, topic, qos) {
  const tb = strBytes(topic);
  const vh = [(pid>>8)&0xff, pid&0xff];
  const payload = [(tb.length>>8)&0xff, tb.length&0xff, ...tb, qos&0xff];
  return packet(0x82, [...vh, ...payload]);
}
function buildPublish(topic, buf, qos) {
  const tb = strBytes(topic);
  const vh = [(tb.length>>8)&0xff, tb.length&0xff, ...tb];
  let extra = [];
  if (qos>0) { /* no packet id for demo */ }
  return packet(0x30, [...vh, ...extra, ...buf]);
}
function buildPing() { return packet(0xC0, []); }
function packet(type, body) {
  const rl = varint(body.length);
  return new Uint8Array([type, ...rl, ...body]);
}
function varint(n) {
  const out=[];
  do { let b=n%128; n=Math.floor(n/128); if(n>0) b|=128; out.push(b); } while(n>0);
  return out;
}
function strBytes(s){ const a=[]; for(let i=0;i<s.length;i++) a.push(s.charCodeAt(i)&0xff); return a; }
function decVarint(buf, pos){
  let v=0,m=1; let p=pos;
  while(true){ const b=buf[p]; v+=(b&0x7f)*m; p++; if((b&0x80)===0) break; m*=128; }
  return [v,p];
}

function makeClient(name){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket('wss://broker.hivemq.com:8884/mqtt',{protocol:'mqtt'});
    ws.binaryType='arraybuffer';
    const c={ws,name,pid:1,onMsg:null,onStatus:null};
    let alive=false;
    const ping=setInterval(()=>{ if(alive&&ws.readyState===1) ws.send(buildPing()); },15000);
    ws.on('open',()=>{ ws.send(buildConnect('scanorder_test_'+name+'_'+Date.now(),30)); });
    ws.on('message',(data)=>{
      const buf=new Uint8Array(data instanceof ArrayBuffer?data:Buffer.from(data));
      const type=buf[0]>>4;
      if(type===2){ alive=true; c.onStatus&&c.onStatus('online'); resolve(c); }
      else if(type===9){ /* suback */ }
      else if(type===3){
        let p=1; const [tlen,p2]=decVarint(buf,p); let q=p2;
        const topicLen=(buf[q]<<8)|buf[q+1]; q+=2;
        const topic=String.fromCharCode(...buf.slice(q,q+topicLen)); q+=topicLen;
        const payload=buf.slice(q);
        c.onMsg&&c.onMsg(topic, payload);
      } else if(type===13){ /* pingresp */ }
    });
    ws.on('error',(e)=>{ clearInterval(ping); reject(e); });
    ws.on('close',()=>{ clearInterval(ping); c.onStatus&&c.onStatus('offline'); });
    c.publish=(topic,payloadBuf)=>ws.send(buildPublish(topic,payloadBuf,0));
    c.subscribe=(topic)=>{ c.pid++; ws.send(buildSubscribe(c.pid,topic,0)); };
    c._ws=ws;
  });
}

(async()=>{
  const topic='scanorder/verify_'+Date.now();
  const a=await makeClient('A');
  a.subscribe(topic);
  const b=await makeClient('B');
  let got=null;
  a.onMsg=(t,p)=>{ if(t===topic) got=Buffer.from(p).toString('utf8'); };
  await new Promise(r=>setTimeout(r,800));
  b.publish(topic, strBytes('hello-from-b'));
  await new Promise(r=>setTimeout(r,1500));
  if(got==='hello-from-b'){ console.log('MQTT_OK cross-pubsub works'); process.exit(0); }
  else { console.log('MQTT_FAIL got=',got); process.exit(1); }
})().catch(e=>{ console.log('MQTT_ERROR',e.message); process.exit(2); });
