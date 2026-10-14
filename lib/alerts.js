/**
 * Nordlysradar intelligent alerts. Pure decision logic shared by the browser and
 * the scheduled GitHub Actions worker. Scores are OBSERVATION INDICES, never odds.
 */
import {buildHours,conditionsFor,kpG,utc} from './scoring.js';

const HOUR=3600000;
const intervals={now:3*HOUR,soon:6*HOUR,storm:18*HOUR};

function numberOr(value,fallback){return Number.isFinite(Number(value))?Number(value):fallback;}
function localTime(date,timeZone){
  try{return new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);}
  catch{return new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);}
}
function inQuietHours(date,s){
  if(!/^\d\d:\d\d$/.test(s.quietStart||'') || !/^\d\d:\d\d$/.test(s.quietEnd||'') || s.quietStart===s.quietEnd) return false;
  const t=localTime(date,s.timezone||'Europe/Copenhagen');
  return s.quietStart<s.quietEnd ? t>=s.quietStart && t<s.quietEnd : t>=s.quietStart||t<s.quietEnd;
}
function hourLocal(date,timezone){
  return new Intl.DateTimeFormat('da-DK',{hour:'2-digit',minute:'2-digit',timeZone:timezone||'Europe/Copenhagen'}).format(date);
}
export function candidates(now, location, space, weather, settings){
  const threshold=Math.max(20,Math.min(90,numberOr(settings.alertThreshold,55)));
  const opts={...settings};
  const current=conditionsFor(now,location,space,weather,opts);
  const hours=buildHours(now,location,space,weather,opts,14);
  const out=[];
  const localLabel=(location.name||'din lokation').slice(0,55);
  if(settings.alertNow!==false && current.score!=null && current.score>=threshold && current.darkness>=.60 && current.wx?.cloud<80){
    out.push({kind:'now',title:'Nordlys: Gå ud og kig!',message:`Indeks ${current.score}/100 ved ${localLabel}. Kp ${current.kp==null?'ukendt':current.kp.toFixed(1)}, skyer ${Math.round(current.wx.cloud)} %. Kig mod nord.`,priority:4,score:current.score,kp:current.kp});
  }
  if(settings.alertSoon!==false){
    const nearest=hours.filter(h=>h.date.getTime()>now.getTime()+45*60000 && h.date.getTime()<=now.getTime()+6*HOUR && h.score!=null && h.score>=threshold && h.darkness>=.6 && h.wx?.cloud<80).sort((a,b)=>b.score-a.score)[0];
    if(nearest){
      out.push({kind:'soon',title:'Muligt nordlys senere',message:`Gode forhold kan opstå ved ${localLabel} omkring kl. ${hourLocal(nearest.date,settings.timezone)}. Prognoseindeks ${nearest.score}/100, skyer ${Math.round(nearest.wx.cloud)} %. Usikkert varsel.`,priority:3,score:nearest.score,kp:nearest.kp});
    }
  }
  if(settings.alertStorm!==false){
    const minimum=Math.max(5,Math.min(9,numberOr(settings.alertStormKp,7)));
    const start=now.getTime();
    const pred=(space?.kp||[]).filter(row=>row.kind==='predicted' && Number.isFinite(Number(row.kp)) && Number(row.kp)>=minimum && utc(row.time)?.getTime()>start && utc(row.time)?.getTime()<start+48*HOUR).sort((a,b)=>Number(b.kp)-Number(a.kp))[0];
    if(pred){
      out.push({kind:'storm',title:`Solstormvarsel ${kpG(pred.kp)}`,message:`NOAA varsler Kp ${Number(pred.kp).toFixed(1)} (${kpG(pred.kp)}) omkring ${hourLocal(utc(pred.time),settings.timezone)}. Det øger muligheden for nordlys, men garanterer ikke synlighed ved ${localLabel}.`,priority:3,score:null,kp:Number(pred.kp)});
    }
  }
  return out;
}
/** Return only one highest-priority unmuted event, respect per-kind cooldown. */
export function nextAlert(now,location,space,weather,settings,lastSent={}){
  if(settings.alerts===false || !space?.kp?.length || !weather?.hourly?.time?.length) return null;
  if(inQuietHours(now,settings)) return null;
  const events=candidates(now,location,space,weather,settings);
  const sinceAny=now.getTime()-numberOr(lastSent._lastAny,0);
  return events.find(item => {
    if(now.getTime()-numberOr(lastSent[item.kind],0)<intervals[item.kind])return false;
    // Avoid several notices for the same storm. 'Look now' may supersede an earlier heads-up.
    if(item.kind==='now')return sinceAny>=45*60000 || !lastSent._lastKind || lastSent._lastKind==='storm';
    return sinceAny>=3*HOUR;
  })||null;
}
export function recordAlert(lastSent={},event,now){
  if(!event || !intervals[event.kind])return {...lastSent};
  return {...lastSent,[event.kind]:now.getTime(),_lastAny:now.getTime(),_lastKind:event.kind};
}
