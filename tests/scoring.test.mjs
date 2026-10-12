import test from 'node:test';
import assert from 'node:assert/strict';
import {skyAt,moonPhaseName,nextMoonEvents} from '../lib/astro.js';
import {kpAt,kpG,activityForKp,conditionsFor,groupStorms} from '../lib/scoring.js';
const loc={name:'København',lat:55.6761,lon:12.5683};
const date=new Date('2026-10-12T21:00:00Z');
const space={kp:[{time:'2026-10-12T21:00:00',kp:7,kind:'observed'},{time:'2026-10-13T00:00:00',kp:4,kind:'predicted'}],aurora:{points:[]}};
const weather=(cloud)=>({hourly:{time:[date.getTime()/1000],cloud_cover:[cloud],cloud_cover_low:[cloud],cloud_cover_mid:[0],cloud_cover_high:[0],visibility:[20000]}});
test('NOAA three-hour Kp intervals expire correctly',()=>{
 assert.equal(kpAt(space.kp,new Date('2026-10-12T23:59:00Z')).kp,7);
 assert.equal(kpAt(space.kp,new Date('2026-10-13T00:00:00Z')).kind,'predicted');
 assert.equal(kpAt(space.kp,new Date('2026-10-13T04:00:00Z')),null);
});
test('G scale approximately follows rounded Kp',()=>{
 assert.equal(kpG(3.33),'—');assert.equal(kpG(4.67),'G1');assert.equal(kpG(6.67),'G3');
});
test('latitude and Kp increase northern aurora heuristic',()=>{
 assert.ok(activityForKp(7,55)>activityForKp(4,55));
 assert.ok(activityForKp(5,68)>activityForKp(5,55));
});
test('sky physics: day is never a good observing time',()=>{
 const noon=new Date('2026-06-21T12:00:00Z');
 const data={kp:[{time:'2026-06-21T12:00:00',kp:9,kind:'predicted'}],aurora:{points:[]}};
 const wx={hourly:{time:[noon.getTime()/1000],cloud_cover:[0],visibility:[20000]}};
 const result=conditionsFor(noon,loc,data,wx,{light:'dark'});
 assert.equal(result.score,0);
});
test('cloud cover strongly reduces score during darkness',()=>{
 const clear=conditionsFor(date,loc,space,weather(0),{light:'dark'});
 const cloud=conditionsFor(date,loc,space,weather(100),{light:'dark'});
 assert.ok(clear.score>cloud.score*3,`clear ${clear.score}, cloud ${cloud.score}`);
});
test('missing weather / missing Kp do not invent a score',()=>{
 assert.equal(conditionsFor(date,loc,space,null,{}).score,null);
 assert.equal(conditionsFor(date,loc,{},weather(5),{}).score,null);
});
test('astronomy results are physical and moon events parseable',()=>{
 const s=skyAt(date,loc.lat,loc.lon);
 assert.ok(s.moonFraction>=0 && s.moonFraction<=1);
 assert.ok(s.sunAlt>-90 && s.sunAlt<90);
 assert.ok(s.moonAlt>-90 && s.moonAlt<90);
 assert.equal(typeof moonPhaseName(s.moonPhase),'string');
 const events=nextMoonEvents(date,loc.lat,loc.lon);
 assert.ok(events.rise instanceof Date || events.set instanceof Date);
});
test('group storm history by three-hour periods',()=>{
 const rows=[{time:'2026-10-09T00:00:00',kp:5,g:'G1'},
 {time:'2026-10-09T03:00:00',kp:6,g:'G2'},
 {time:'2026-10-09T21:00:00',kp:7,g:'G3'}];
 const groups=groupStorms(rows);
 assert.equal(groups.length,2); assert.equal(groups.at(-1).peak,6);
});
