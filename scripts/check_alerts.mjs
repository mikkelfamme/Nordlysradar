/**
 * Scheduled personal notifications. Required GitHub Actions secret:
 *   NORDLYS_ALERT_CONFIG = JSON settings copied from Nordlysradar settings.
 * No location, ntfy topic, coordinates or push payload is committed to Git.
 * Only the last sent timestamp per kind is saved to data/alert-state.json.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {nextAlert,recordAlert} from '../lib/alerts.js';
import {getWeather} from '../lib/data.js';

const PATH='data/alert-state.json';
const NOAA='https://services.swpc.noaa.gov';

function parseSettings(raw){
  if(!raw) return null;
  let data;
  try{data=JSON.parse(raw);}catch{throw new Error('GitHub secret NORDLYS_ALERT_CONFIG er ikke gyldig JSON.');}
  if(!data || data.schema_version!==1 || !data.location || !Number.isFinite(data.location.lat) || !Number.isFinite(data.location.lon) || Math.abs(data.location.lat)>90 || Math.abs(data.location.lon)>180)throw new Error('Alarmkonfigurationen mangler en gyldig lokation.');
  if(!/^[a-zA-Z0-9_-]{14,90}$/.test(data.ntfyTopic||''))throw new Error('ntfy-topic er ikke gyldig. Brug en tilfældig lang nøgle.');
  if(!/^https:\/\/ntfy\.sh\/$/.test(data.ntfyServer||'https://ntfy.sh/'))throw new Error('Kun https://ntfy.sh/ understøttes i denne version.');
  const settings={...data,light:['city','suburb','dark'].includes(data.light)?data.light:'suburb',mode:data.mode==='camera'?'camera':'eye',alerts:true};
  return settings;
}
async function fetchJSON(path,ms=22000){
  const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),ms);
  try{const response=await fetch(NOAA+path,{signal:ac.signal,headers:{'User-Agent':'Nordlysradar/1.1 (personal aurora alert system)'}});if(!response.ok)throw new Error(`NOAA HTTP ${response.status}`);return await response.json();}
  finally{clearTimeout(timer);}
}
function normalizeKp(rows){
  return rows.filter(x=>x && typeof x==='object' && x.time_tag && Number.isFinite(Number(x.kp)))
    .map(x=>({time:x.time_tag,kp:Number(x.kp),kind:x.observed==='predicted'?'predicted':x.observed==='estimated'?'estimated':'observed'}));
}
function compactAurora(raw){
  const points=Array.isArray(raw?.coordinates)?raw.coordinates:[];
  return {forecast_time:raw?.['Forecast Time']||null,observation_time:raw?.['Observation Time']||null,
    points:points.filter(p=>Array.isArray(p)&&p.length>=3&&p[1]>=38&&p[1]<=90&&p[2]>=2&&p[0]%2===0&&p[1]%2===0)};
}
async function loadLiveSpace(){
  const kp=normalizeKp(await fetchJSON('/products/noaa-planetary-k-index-forecast.json'));
  if(!kp.length)throw new Error('NOAA Kp-forecast uden gyldige værdier');
  let aurora={};
  try{aurora=compactAurora(await fetchJSON('/json/ovation_aurora_latest.json'));}catch{console.log('OVATION kunne ikke hentes; Kp bruges alene');}
  return {kp,aurora,updated_at:new Date().toISOString()};
}
function buildAppURL(){
  const repo=process.env.GITHUB_REPOSITORY||'';
  const [owner,name]=repo.split('/');
  return owner&&name?`https://${owner}.github.io/${name}/`:'';
}
async function notify(event,topic,link){
  const body={topic,title:event.title,message:event.message,priority:event.priority,
    tags:['milky_way'],...(link?{click:link,actions:[{action:'view',label:'Åbn Nordlysradar',url:link}]}:{})};
  const response=await fetch('https://ntfy.sh/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Pushbesked kunne ikke sendes (${response.status})`);
}
export async function runAlertCheck({config=process.env.NORDLYS_ALERT_CONFIG,now=new Date(),getSpace=loadLiveSpace,getWx=getWeather,send=notify,readState=null,saveState=null,testMode=process.env.SEND_TEST==='true'}={}){
  const cfg=parseSettings(config);
  if(!cfg){console.log('Ingen personlig alarm konfigureret. Tilføj NORDLYS_ALERT_CONFIG under GitHub Actions Secrets.');return {status:'not_configured'};}
  if(testMode){
    await send({kind:'test',title:'Nordlysradar er tilsluttet',message:'Dette er en test. Du får automatisk besked, når dine nordlysbetingelser opfyldes.',priority:3},cfg.ntfyTopic,buildAppURL());
    console.log('Test-push sendt.');
    return {status:'test_sent'};
  }
  const last=readState?await readState():existsSync(PATH)?JSON.parse(await readFile(PATH,'utf8')):{};
  // Never send notifications with outdated NOAA or weather data.
  const [space,weather]=await Promise.all([getSpace(),getWx(cfg.location)]);
  const event=nextAlert(now,cfg.location,space,weather,cfg,last);
  if(!event){console.log('Ingen ny nordlysalarm.');return {status:'no_alert'};}
  await send(event,cfg.ntfyTopic,buildAppURL());
  const updated=recordAlert(last,event,now);
  if(saveState)await saveState(updated);else await writeFile(PATH,JSON.stringify(updated,null,2)+'\n');
  console.log(`Alarm sendt: ${event.kind}; der logges ingen personlige oplysninger.`);
  return {status:'sent',kind:event.kind};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runAlertCheck().catch(e=>{console.error('Nordlysradar alarmcheck fejlede:',e.message);process.exitCode=1;});
