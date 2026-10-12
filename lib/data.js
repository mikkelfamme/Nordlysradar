import {utc} from './scoring.js';
const NOAA='https://services.swpc.noaa.gov';
async function fetchJson(url,timeout=10000) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const r=await fetch(url,{signal:controller.signal,cache:'no-store'});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {clearTimeout(timer);}
}
async function readLocal(path) {
  try{return await fetchJson(`${path}?v=${Math.floor(Date.now()/60000)}`,5500);}catch{return null;}
}
function compactAurora(json) {
  const coords=Array.isArray(json?.coordinates)?json.coordinates:[];
  // Downsample the dense 65k-point NOAA raster to a compact, client-side polar map.
  return {observation_time:json?.['Observation Time']||null,forecast_time:json?.['Forecast Time']||null,
    points:coords.filter(([lon,lat,intensity])=>lat>=38&&lat<=90&&Number(intensity)>=2&&Number(lon)%2===0&&Number(lat)%2===0).map(([x,y,z])=>[x,y,Number(z)])};
}
function normalizeKp(rows) {
  return Array.isArray(rows)?rows.filter(r=>r?.time_tag&&Number.isFinite(Number(r.kp))).map(r=>({
    time:r.time_tag,kp:Number(r.kp),kind:r.observed==='predicted'?'predicted':r.observed==='estimated'?'estimated':'observed',g:r.noaa_scale||null
  })):[];
}
async function fetchLiveSpace() {
  const [kp,aurora,alerts,mag,wind]=await Promise.allSettled([
    fetchJson(`${NOAA}/products/noaa-planetary-k-index-forecast.json`,8000),
    fetchJson(`${NOAA}/json/ovation_aurora_latest.json`,14000),
    fetchJson(`${NOAA}/products/alerts.json`,9000),
    fetchJson(`${NOAA}/json/rtsw/rtsw_mag_1m.json`,14000),
    fetchJson(`${NOAA}/json/rtsw/rtsw_wind_1m.json`,14000)
  ]);
  const good = v => v.status==='fulfilled'?v.value:null;
  const latest = rows => Array.isArray(rows)?rows.filter(r=>r&&r.active!==false).at(-1):null;
  const mg=latest(good(mag)),wd=latest(good(wind));
  const s={schema_version:1,status:'partial',updated_at:new Date().toISOString(),kp:normalizeKp(good(kp)),
    aurora:compactAurora(good(aurora)),solar_wind:{time:mg?.time_tag||wd?.time_tag||null,
      bz:mg?.bz_gsm??null,speed:wd?.proton_speed??null,density:wd?.proton_density??null},
    alerts: Array.isArray(good(alerts))?good(alerts).filter(a=>/^A[1-5]0F$|^K0[4-9][AW]$/.test(a.product_id)).slice(0,25).map(a=>({id:a.product_id,time:a.issue_datetime,message:a.message?.slice(0,550)})):[]};
  return s;
}
export async function getSpace() {
  const local=await readLocal('./data/space-weather.json');
  const last=utc(local?.updated_at)?.getTime()||0;
  // The Actions snapshot works without NOAA CORS. When stale, attempt direct NOAA.
  if(local?.kp?.length && Date.now()-last<45*60000) return {...local,source:'GitHub Actions'};
  try {
    const live=await fetchLiveSpace();
    if(live.kp.length) return {...live,source:'NOAA direkte'};
  } catch{ /* fall back to previously collected snapshot */ }
  return {...(local||{}),source:local?.kp?.length?'Seneste snapshot':'Afventer første dataopdatering'};
}
export async function getHistory() {
  const d=await readLocal('./data/history.json');
  return Array.isArray(d?.kp_samples)?d.kp_samples:[];
}
export async function getWeather(loc) {
  const params=new URLSearchParams({latitude:String(loc.lat),longitude:String(loc.lon),
    hourly:'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation_probability',
    forecast_days:'4',past_days:'1',timeformat:'unixtime',timezone:'auto'});
  const data=await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`,11000);
  if(!data?.hourly?.time?.length) throw new Error('Ingen vejrdata modtaget');
  return data;
}
export async function geocode(place) {
  const params=new URLSearchParams({name:place,count:'6',language:'da',format:'json'});
  const d=await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`,7500);
  return (d.results||[]).map(r=>({name:r.name,region:r.admin1||r.country||'',lat:r.latitude,lon:r.longitude,country:r.country||''}));
}
