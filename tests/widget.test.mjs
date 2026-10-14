import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const script=await readFile(new URL('../widget/Nordlysradar.js',import.meta.url),'utf8');
class UI{
  constructor(){this.children=[];}
  addText(s){this.children.push(String(s));return {font:null,textColor:null,lineLimit:0};}
  addSpacer(){}
  addStack(){return this;}
  centerAlignContent(){}
  layoutVertically(){}
  layoutHorizontally(){}
  setPadding(){}
}
const fakeRequest=class {
 constructor(url){this.url=url;}
 async loadJSON(){
  const now=new Date(),floor=Math.floor(now.getTime()/3600000)*3600000;
  if(this.url.includes('space-weather.json'))return {
   updated_at:now.toISOString(),kp:Array.from({length:20},(_,i)=>({time:new Date(floor-(i-1)*3*3600000).toISOString(),kp:7,kind:'observed'})),aurora:{points:[]}};
  if(this.url.includes('open-meteo.com'))return {hourly:{time:[Math.floor(now.getTime()/1000)],cloud_cover:[12],visibility:[20000]}};
  throw new Error('unexpected URL '+this.url);
 }
};
test('Scriptable widget renders a real widget view with NOAA and weather metrics',async()=>{
 let output=null;
 const context={args:{widgetParameter:'55.6761,12.5683,København,dark,camera'},config:{runsInWidget:true,widgetFamily:'medium'},
  ListWidget:UI,Request:fakeRequest,Color:class{constructor(){}},LinearGradient:class{},Font:{boldSystemFont:()=>({}),systemFont:()=>({})},
  Script:{setWidget(w){output=w},complete(){}},Date,Math,Number,String,Promise,Intl,Error,console};
 const code=`(async()=>{${script}\n})()`;
 await vm.runInNewContext(code,context,{timeout:6000});
 assert.ok(output);
 const rendered=output.children.join('|');
 assert.match(rendered,/NORDLYSRADAR/);
 assert.match(rendered,/København/);
 assert.match(rendered,/Skyer/);
 assert.match(rendered,/Måne/);
 assert.match(rendered,/Kp/);
});
