import test from 'node:test';
import assert from 'node:assert/strict';
import {candidates,nextAlert,recordAlert} from '../lib/alerts.js';
import {mercator,inverseMercator,nearbyAurora} from '../lib/interactive-map.js';
import {runAlertCheck} from '../scripts/check_alerts.mjs';
const place={lat:55.6761,lon:12.5683,name:'København'};
const now=new Date('2026-10-14T21:00:00Z');
const prefs={light:'dark',mode:'camera',alerts:true,alertThreshold:35,alertNow:true,alertSoon:true,alertStorm:true,timezone:'Europe/Copenhagen'};
function inputs(cloud=0){
  const hours=Array.from({length:60},(_,i)=>Math.floor(now.getTime()/3600000)*3600+i*3600);
  const wx={hourly:{time:hours,cloud_cover:hours.map(()=>cloud),visibility:hours.map(()=>20000)}};
  const kp=Array.from({length:25},(_,i)=>({time:new Date(now.getTime()-3*3600000 + i*3*3600000).toISOString(),kp:8,kind:i===0?'observed':'predicted'}));
  return [{kp,aurora:{points:[]}},wx];
}
test('good clear dark sky triggers current alert, cooldown stops duplicates',()=>{
 const [space,weather]=inputs(0);
 const e=nextAlert(now,place,space,weather,prefs,{});
 assert.ok(e);
 assert.equal(e.kind,'now');
 assert.ok(e.score>=35);
 assert.equal(nextAlert(new Date(now.getTime()+5*60000),place,space,weather,prefs,recordAlert({},e,now)),null);
 const recorded={now:now.getTime(),soon:now.getTime(),storm:now.getTime()};
 assert.equal(nextAlert(now,place,space,weather,prefs,recorded),null);
});
test('clouds block immediate visibility even when geomagnetic storm is strong',()=>{
 const [space,weather]=inputs(100);
 const e=candidates(now,place,space,weather,prefs);
 assert.ok(!e.some(x=>x.kind==='now'||x.kind==='soon'));
 assert.ok(e.some(x=>x.kind==='storm'));
});
test('quiet hours block notifications; disabling alert types is respected',()=>{
 const [space,weather]=inputs(0);
 const cfg={...prefs,quietStart:'22:00',quietEnd:'06:00'};
 assert.equal(nextAlert(now,place,space,weather,cfg,{}),null);
 const e=candidates(now,place,space,weather,{...prefs,alertNow:false,alertSoon:false,alertStorm:false});
 assert.deepEqual(e,[]);
});
test('skip alerts if NOAA or weather is missing',()=>{
 const [space,weather]=inputs(0);
 assert.equal(nextAlert(now,place,{kp:[]},weather,prefs),null);
 assert.equal(nextAlert(now,place,space,{},prefs),null);
});
test('map projections roundtrip coordinates and respect date-line',()=>{
 for(const pair of [{lat:56,lon:13},{lat:70,lon:180},{lat:62,lon:-175}]){
  const point=mercator(pair.lon,pair.lat,4);
  const back=inverseMercator(point.x,point.y,4);
  assert.ok(Math.abs(back.lat-pair.lat)<.0001);
  assert.ok(Math.abs(Math.abs(back.lon)-Math.abs(pair.lon))<.0001);
 }
 assert.equal(nearbyAurora([[10,65,35]],55,10,300),null);
 assert.ok(nearbyAurora([[10,65,35]],64,11,300)?.power===35);
});
test('background monitoring publishes exactly one message and stores only timestamps',async()=>{
 const [space,weather]=inputs(0);const sent=[],saved=[];
 const config=JSON.stringify({...prefs,schema_version:1,location:place,ntfyTopic:'nordlys-a-very-long-random-unique-topic',ntfyServer:'https://ntfy.sh/'});
 const a=await runAlertCheck({config,now,getSpace:async()=>space,getWx:async()=>weather,send:async(...args)=>sent.push(args),readState:async()=>({}),saveState:async d=>saved.push(d)});
 assert.equal(a.status,'sent');assert.equal(sent.length,1);assert.equal(a.kind,'now');assert.ok(saved[0].now);
 const b=await runAlertCheck({config,now,getSpace:async()=>space,getWx:async()=>weather,send:async()=>{throw new Error('Duplicate push')},readState:async()=>saved[0],saveState:async d=>saved.push(d)});
 assert.equal(b.status,'no_alert');
});
test('manual test push works even when NOAA cannot be reached',async()=>{
 const cfg=JSON.stringify({...prefs,schema_version:1,location:place,ntfyTopic:'nordlys-a-very-long-random-unique-topic'});
 let count=0;
 const out=await runAlertCheck({config:cfg,now,testMode:true,getSpace:()=>{throw new Error('NOAA offline')},getWx:()=>{throw new Error('Weather offline')},send:async event=>{count++;assert.equal(event.kind,'test')}});
 assert.equal(count,1);
 assert.equal(out.status,'test_sent');
});
