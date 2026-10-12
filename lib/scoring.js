import {skyAt} from './astro.js';
export const clamp = (x,min=0,max=100) => Math.max(min,Math.min(max,x));
export const utc = s => { if (!s) return null; if (typeof s === 'number') return new Date(s*1000); return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s.replace(' ','T')+'Z'); };
const ms3h = 3*3600000;

export function kpAt(forecast, date) {
  if (!Array.isArray(forecast) || !forecast.length) return null;
  const t = date.getTime();
  const rows = forecast.filter(r=>Number.isFinite(Number(r.kp)) && r.time).sort((a,b)=>utc(a.time)-utc(b.time));
  for(let i=rows.length-1;i>=0;i--) {
    const start=utc(rows[i].time)?.getTime();
    const next = i+1<rows.length ? utc(rows[i+1].time)?.getTime() : start + ms3h;
    if (Number.isFinite(start) && t>=start && t<Math.min(next,start+ms3h+60000)) return rows[i];
  }
  return null;
}
export function kpG(kp) {
  const round=Math.round(Number(kp));
  return round>=5 ? `G${clamp(round-4,1,5)}` : '—';
}
export function kmDistance(lat1,lon1,lat2,lon2) {
  const r=Math.PI/180;
  const dLat=(lat2-lat1)*r, dLon=(lon2-lon1)*r;
  const h=Math.sin(dLat/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
/** OVATION is NOT a probabilistic percent. We compute a heuristic geographic signal.
 * Bright aurora can be seen up to ~1000 km away, in very favorable circumstances.
 */
export function ovationSignal(aurora, location) {
  if (!aurora?.forecast_time || !Array.isArray(aurora.points)) return null;
  const at=utc(aurora.forecast_time)?.getTime();
  if (!Number.isFinite(at) || Math.abs(at-Date.now())>2*3600000) return null;
  let best=0, nearKm=Infinity, peakPower=0;
  for(const [lon,lat,intensity] of aurora.points) {
    if (intensity<3 || lat<location.lat-10) continue;
    const d=kmDistance(location.lat,location.lon,lat,lon);
    if (d>1250) continue;
    const weight=Math.pow(Math.max(0,1-d/1250),1.05)*Math.min(1,intensity/32);
    if (weight>best) {best=weight;nearKm=d;peakPower=intensity;}
  }
  return {score: Math.round(clamp(best*100)), distance: Number.isFinite(nearKm)?Math.round(nearKm):null, strength:peakPower};
}
export function activityForKp(kp, lat, ovalSignal=null) {
  if (kp===null || !Number.isFinite(Number(kp))) return ovalSignal?.score ?? null;
  // Heuristic latitude adjustment, NOT a transformation to geomagnetic latitude.
  const threshold=clamp(6.1 - (lat-55.5)*.26,1.8,9.2);
  const kpScore=clamp(100/(1+Math.exp(-(Number(kp)-threshold)*1.03)));
  return Math.round(ovalSignal ? (.64*kpScore+.36*ovalSignal.score) : kpScore);
}
function weatherAt(weather, date) {
  if (!weather?.hourly?.time?.length) return null;
  const arr=weather.hourly.time, target=date.getTime()/1000;
  let bestIndex=-1, delta=Infinity;
  for(let i=0;i<arr.length;i++) {
    const t=Number(arr[i]); const d=Math.abs(t-target);
    if (d<delta) {delta=d;bestIndex=i;}
  }
  if(bestIndex<0 || delta>55*60) return null;
  const h=weather.hourly;
  const n=(field)=> { const value=h[field]?.[bestIndex];return value==null||!Number.isFinite(Number(value))?null:Number(value); };
  return {cloud:n('cloud_cover'),low:n('cloud_cover_low'),mid:n('cloud_cover_mid'),high:n('cloud_cover_high'),visibility:n('visibility'),precip:n('precipitation_probability'),time:arr[bestIndex]};
}
export function conditionsFor(date, location, space, weather, preferences={}) {
  const sky=skyAt(date,location.lat,location.lon);
  const wx=weatherAt(weather,date);
  const kpRow=kpAt(space?.kp,date);
  const kp=kpRow?.kp==null?null:Number(kpRow.kp);
  const oval = Math.abs(date.getTime()-Date.now())<2*3600000 ? ovationSignal(space?.aurora,location) : null;
  const activity=activityForKp(kp,location.lat,oval);
  const cloud=wx?.cloud;
  // Daylight is an absolute blocker, clouds nearly so. Moon never an absolute blocker.
  const darkness=sky.sunAlt>=-4?0:sky.sunAlt<=-18?1:clamp((-sky.sunAlt-4)/14,0,1);
  const cloudFactor=cloud===null||cloud===undefined?null:clamp(1-.96*(cloud/100)**1.3,0,1);
  const moonFactor=sky.moonAlt<=0?1:1-Math.min(.52,sky.moonFraction**.73*(.18+.34*Math.sin(Math.min(90,sky.moonAlt)*Math.PI/180)));
  const lightFactor={city:.72,suburb:.87,dark:1}[preferences.light] ?? .87;
  const fogFactor=wx?.visibility!=null && wx.visibility<5000?clamp(.5+wx.visibility/10000,.5,1):1;
  const modeFactor=preferences.mode==='camera'?1.17:1;
  const score=(activity!==null && cloudFactor!==null)?Math.round(clamp(activity*darkness*cloudFactor*moonFactor*lightFactor*fogFactor*modeFactor)):null;
  const forecastType=kpRow?.kind || null;
  const kpSource = forecastType==='predicted'?'Prognose':forecastType==='estimated'?'Estimeret':forecastType==='observed'?'Observeret':null;
  return {date,sky,wx,kp,kpSource,forecastType,oval,activity,cloudFactor,darkness,moonFactor,score};
}
export function verdict(score) {
  if(score==null) return {label:'Afventer målinger',short:'Afventer',tone:'muted',hint:'Prognosen kan ikke beregnes, før alle nødvendige data er tilgængelige.'};
  if(score>=80) return {label:'Fremragende forhold',short:'Meget gode',tone:'great',hint:'Meget gode betingelser for at forsøge at se nordlys.'};
  if(score>=60) return {label:'Gode muligheder',short:'Gode',tone:'good',hint:'Gå ud et mørkt sted med fri horisont mod nord.'};
  if(score>=35) return {label:'Hold øje med himlen',short:'Muligt',tone:'moderate',hint:'Der er potentiale, men forholdene er ikke optimale.'};
  if(score>=17) return {label:'Begrænset mulighed',short:'Lav chance',tone:'low',hint:'Svagt nordlys kan være vanskeligt at se.'};
  return {label:'Ikke optimale forhold',short:'Lav',tone:'low',hint:'Sandsynligheden for at få et godt syn er meget lille lige nu.'};
}
export function explain(c) {
  if(!c) return 'Vælg en lokation for at beregne forholdene.';
  if(c.score==null) return 'Vi mangler stadig målinger fra NOAA eller vejrudsigten. Ingen gættede værdier vises.';
  if(c.sky.sunAlt>=-4) return 'Himlen er for lys lige nu. Se prognosen for næste mørke tidsrum.';
  if(c.wx?.cloud>=85) return 'Mange skyer spærrer for udsynet, selv hvis der er kraftigt nordlys.';
  if(c.kp!=null && c.kp<4 && c.activity<28) return 'Den geomagnetiske aktivitet er forholdsvis lav på din breddegrad.';
  if(c.wx?.cloud>=55) return 'Skydækket begrænser udsynet. Kig efter huller i skyerne.';
  if(c.sky.moonAlt>0 && c.sky.moonFraction>.75) return 'Månen lyser himlen op. Kraftigt nordlys kan stadig være synligt.';
  if(c.score>=60) return 'Aktivitet og himmelforhold ser lovende ud. Søg fri udsigt mod nord.';
  return 'Følg aktiviteten og de kommende timers skydække.';
}
export function buildHours(now, location, space, weather, prefs, count=72) {
  const floor=new Date(Math.floor(now.getTime()/3600000)*3600000);
  return Array.from({length:count},(_,i)=>conditionsFor(new Date(floor.getTime()+i*3600000),location,space,weather,prefs));
}
export function groupStorms(samples) {
  if(!Array.isArray(samples)) return [];
  const rows=samples.filter(r=>Number(r.kp)>=4.67&&r.time).sort((a,b)=>utc(a.time)-utc(b.time));
  const groups=[];
  for (const row of rows) {
    const last=groups.at(-1), t=utc(row.time)?.getTime();
    if (!Number.isFinite(t)) continue;
    if(last && t-last.lastTime <= 4*3600000) {
      last.lastTime=t;
      if(Number(row.kp)>last.peak) {last.peak=Number(row.kp);last.g=row.g&&row.g!=='—'?row.g:kpG(row.kp);}
      last.samples++;
    } else groups.push({start:row.time,firstTime:t,lastTime:t,peak:Number(row.kp),g:row.g&&row.g!=='—'?row.g:kpG(row.kp),samples:1});
  }
  return groups.reverse();
}
