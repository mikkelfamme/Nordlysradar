const SETTINGS='nordlysradar.settings.v1',LOG='nordlysradar.log.v1';
export const DEFAULT_LOCATION={name:'København',region:'Hovedstaden',lat:55.6761,lon:12.5683};
export const DEFAULT_SETTINGS={
  location:DEFAULT_LOCATION,places:[DEFAULT_LOCATION],light:'city',mode:'eye',
  alertThreshold:55,alerts:true,alertNow:true,alertSoon:true,alertStorm:true,alertStormKp:7,
  quietStart:'',quietEnd:'',pushTopic:'',autoRefresh:true
};
function read(key,def) {try{const o=JSON.parse(localStorage.getItem(key));return o??def;}catch{return def;}}
export function loadSettings() {
  const s=read(SETTINGS,{});
  return {...DEFAULT_SETTINGS,...s,location: isLocation(s.location)?s.location:DEFAULT_LOCATION,
    places:Array.isArray(s.places)?s.places.filter(isLocation).slice(0,12):[DEFAULT_LOCATION]};
}
export function saveSettings(s) {localStorage.setItem(SETTINGS,JSON.stringify(s));}
export function isLocation(l){return !!(l&&Number.isFinite(l.lat)&&Number.isFinite(l.lon)&&Math.abs(l.lat)<=90&&Math.abs(l.lon)<=180&&typeof l.name==='string');}
export function loadLog(){const data=read(LOG,[]);return Array.isArray(data)?data:[];}
export function saveLog(data){localStorage.setItem(LOG,JSON.stringify(data));}
export function exportBackup(settings,log) {
  const json=JSON.stringify({app:'Nordlysradar',version:1,exported_at:new Date().toISOString(),settings,observations:log},null,2);
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  a.download=`nordlysradar-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
export async function importBackup(file) {
  if(file.size>5*1024*1024) throw new Error('Backupfilen er for stor (maks. 5 MB).');
  const parsed=JSON.parse(await file.text());
  if(parsed.app!=='Nordlysradar'||parsed.version!==1||!isLocation(parsed.settings?.location)||!Array.isArray(parsed.observations)) throw new Error('Ugyldig Nordlysradar-backup.');
  const observations=parsed.observations.filter(o=>typeof o.id==='string'&&typeof o.date==='string'&&typeof o.note==='string').slice(0,300);
  const settings={...DEFAULT_SETTINGS,...parsed.settings};
  settings.places=Array.isArray(settings.places)?settings.places.filter(isLocation).slice(0,12):[settings.location];
  if(!['city','suburb','dark'].includes(settings.light)) settings.light='city';
  if(!['eye','camera'].includes(settings.mode)) settings.mode='eye';
  settings.alertThreshold=Math.min(90,Math.max(20,Number(settings.alertThreshold)||55));
  settings.alertStormKp=Math.min(9,Math.max(5,Number(settings.alertStormKp)||7));
  if(!/^[a-zA-Z0-9_-]{14,90}$/.test(settings.pushTopic||''))settings.pushTopic='';
  return {settings,observations};
}
