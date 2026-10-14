import {skyAt,moonPhaseName,moonGlyph,nextMoonEvents,darkHoursNext24} from './lib/astro.js';
import {conditionsFor,buildHours,groupStorms,verdict,explain,kpG,utc,clamp} from './lib/scoring.js';
import {getSpace,getWeather,getHistory,geocode} from './lib/data.js';
import {loadSettings,saveSettings,loadLog,saveLog,exportBackup,importBackup,isLocation} from './lib/storage.js';
import {initAuroraMap} from './lib/interactive-map.js';
import {nextAlert,recordAlert} from './lib/alerts.js';

const state={
  settings:loadSettings(),observations:loadLog(),space:null,history:[],weather:null,
  loading:false,weatherError:'',spaceError:'',tab:'overview',selectedHour:null,
  locationsWx:{},geocodeResults:[],geocodeBusy:false,toast:null,lastFetch:0,lastAlert:0,mapCamera:null,showAuroraOverlay:true
};
const TABS=[['overview','Overblik','home'],['forecast','Prognose','chart'],['sky','Måne & himmel','moon'],['storms','Solstorme','sun'],['places','Steder','pin'],['settings','Indstillinger','settings']];
const ICONS={
  map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/>',
  widget:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 11h8M12 7v8"/>',
  home:'<path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/>',
  chart:'<path d="M3 3v18h18"/><path d="m6 16 5-5 4 3 5-7"/>',
  moon:'<path d="M20.2 15A9 9 0 0 1 9 3.8 9 9 0 1 0 20.2 15Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M4.9 4.9 6.5 6.5m11 11 1.6 1.6M12 2v2m0 16v2M2 12h2m16 0h2m-1-7.1-1.6 1.6M6.5 17.5l-1.6 1.6"/>',
  chevron:'<path d="m9 18 6-6-6-6"/>',
  chevronDown:'<path d="m6 9 6 6 6-6"/>',
  refresh:'<path d="M20 11a8 8 0 1 0-3 6"/><path d="M20 4v7h-7"/>',
  arrow:'<path d="M5 12h14m-7-7 7 7-7 7"/>',
  cloud:'<path d="M7 18h12a4 4 0 0 0 .6-8 6.5 6.5 0 0 0-12-1A4.5 4.5 0 0 0 7 18Z"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v6m0-9v.2"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15 9-2 5-4 1 2-5 4-1Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  save:'<path d="M4 3h14l3 3v15H3V3h1Zm2 0v7h12V3m-11 18v-7h10v7"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  x:'<path d="M5 5 19 19M19 5 5 19"/>',
  gps:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  warning:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.3"/>',
  spark:'<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z"/>',
  search:'<circle cx="10.7" cy="10.7" r="6.5"/><path d="m16 16 5 5"/>',
  back:'<path d="m15 18-6-6 6-6"/>',
  book:'<path d="M4 4h14a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V4Zm0 13a2 2 0 0 1 2-2h14"/>',
  camera:'<path d="M4 7h4l2-3h4l2 3h4a1 1 0 0 1 1 1v11H3V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3"/>'
};
const icon=(name,size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.spark}</svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(d,options={})=>new Intl.DateTimeFormat('da-DK',{timeZone:state.weather?.timezone||undefined,...options}).format(d);
const time=d=>d instanceof Date&&!isNaN(d)?fmt(d,{hour:'2-digit',minute:'2-digit'}):'—';
const day=d=>d instanceof Date&&!isNaN(d)?fmt(d,{weekday:'short',day:'numeric',month:'short'}):'—';
const fullDay=d=>d instanceof Date&&!isNaN(d)?fmt(d,{weekday:'long',day:'numeric',month:'long'}):'—';
const padNum=(x,n=0)=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('da-DK',{maximumFractionDigits:n,minimumFractionDigits:n});
const pct=x=>x==null?'—':`${Math.round(x)} %`;
const since=d=>{const t=utc(d)?.getTime();if(!t||!Number.isFinite(t))return 'Ukendt';const min=Math.max(0,Math.round((Date.now()-t)/60000));return min<2?'Netop nu':min<60?`${min} min siden`:`${Math.floor(min/60)} t ${min%60} min siden`;};
const loc=()=>state.settings.location;
const effSpace=()=>{const s=state.space||{};const age=Date.now()-(utc(s.updated_at)?.getTime()||0);
  if (age>4*3600000) return {...s,kp:[],aurora:{}};
  return s;
};
const checked=(x)=>x?'checked':'';
function hourGrid(){return buildHours(new Date(),loc(),effSpace(),state.weather,state.settings);}
function current(){return conditionsFor(new Date(),loc(),effSpace(),state.weather,state.settings);}
function dateRangeForecast(hours,n=36){
  return hours.slice(0,n).filter(h=>h.sky.sunAlt<-10&&h.score!=null).sort((a,b)=>b.score-a.score)[0]||null;
}
function navHtml(mobile=false){return TABS.map(([id,label,pic])=>`<button class="nav-item ${state.tab===id?'active':''}" data-tab="${id}" aria-label="${label}" ${state.tab===id?'aria-current="page"':''}>${icon(pic,mobile?20:19)}<span>${mobile&&id==='settings'?'Mere':mobile&&id==='forecast'?'72 timer':mobile&&id==='storms'?'Storme':mobile&&id==='sky'?'Måne':label}</span>${mobile?'':'<span class="nav-arrow">'+icon('chevron',14)+'</span>'}</button>`).join('');}
function statusChip(){
  const age=Date.now()-(utc(state.space?.updated_at)?.getTime()||0);
  if (state.loading&&!state.space) return '<span class="live-indicator pending"><i></i> Henter data</span>';
  if (!state.space?.kp?.length) return '<span class="live-indicator warn"><i></i> Afventer data</span>';
  if (age>4*3600000) return '<span class="live-indicator warn"><i></i> Forældede data</span>';
  return `<span class="live-indicator"><i></i> ${age>65*60000?'Opdatering afventer':'Data tilgængelige'}</span>`;
}
function shell(){
  return `<div class="app-shell">
  <aside class="sidebar">
    <div class="brand"><div class="brand-logo"><img src="./assets/aurora-icon.svg" alt="" /></div><div><strong>NORDLYSRADAR</strong><small>Din himmel. Dit øjeblik.</small></div></div>
    <div class="side-divider"></div>
    <p class="nav-label">NAVIGATION</p><nav class="side-nav" aria-label="Navigation">${navHtml()}</nav>
    <div class="side-bottom"><span class="tiny-symbol">✦</span><strong>Nordlys begynder på solen</strong><p>Vi kombinerer rumvejr og lokale himmelforhold, så du ved, hvornår det er værd at kigge op.</p><div class="source-mini">NOAA · Open-Meteo · Astronomi</div></div>
  </aside>
  <div class="main-shell">
    <header class="topbar"><div class="mobile-brand"><img src="./assets/aurora-icon.svg" alt="" /><b>NORDLYSRADAR</b></div>
    <button class="location-button" data-tab="places" title="Skift lokation">${icon('pin',17)}<span>${esc(loc().name)}</span>${icon('chevronDown',13)}</button>
    <div class="topbar-actions">${statusChip()}<button data-refresh="1" class="icon-button ${state.loading?'spinning':''}" title="Opdater data" aria-label="Opdater data">${icon('refresh',18)}</button></div></header>
    <main class="main-content" id="main-content">${view()}</main>
    <footer class="footer">Rumvejr: <a target="_blank" rel="noopener noreferrer" href="https://www.swpc.noaa.gov/">NOAA / SWPC</a> · Vejr: <a target="_blank" rel="noopener noreferrer" href="https://open-meteo.com/">Open-Meteo</a> · <span>Indekset er vejledende, ikke en sandsynlighed i %</span></footer>
  </div>
  <nav class="mobile-nav" aria-label="Hovedmenu">${navHtml(true)}</nav>
  ${state.toast?`<div class="toast" role="status">${icon('info',18)} ${esc(state.toast)}</div>`:''}
  ${logDialog()}
  </div>`;
}
function view(){switch(state.tab){case 'forecast':return forecastView();case 'sky':return skyView();case 'storms':return stormsView();case 'places':return placesView();case 'settings':return settingsView();default:return overviewView();}}
function pageHead(kicker,title,sub,buttons=''){return `<div class="page-head"><div><div class="kicker">${kicker}</div><h1>${title}</h1><p>${sub}</p></div>${buttons}</div>`;}
function cardTitle(title,meta=''){return `<div class="card-heading"><h3>${title}</h3>${meta?`<span>${meta}</span>`:''}</div>`;}
function qualityPill(v){return `<span class="pill pill-${v.tone}"><span class="pill-dot"></span>${esc(v.short)}</span>`;}
function emptyNotice(message){return `<div class="empty-notice">${icon('info',21)}<p>${esc(message)}</p></div>`;}
function refreshed(){
  const s=state.space;return `<span class="muted-sub">NOAA: ${esc(s?.updated_at?since(s.updated_at):'afventer første opdatering')}${s?.source?' · '+esc(s.source):''}</span>`;
}
function conditionsList(c){return `<div class="conditions-grid">
  ${metric(icon('sun'),'Kp-indeks',c.kp==null?'—':padNum(c.kp,1),c.kpSource||'Ikke tilgængelig')}
  ${metric(icon('cloud'),'Skydække',pct(c.wx?.cloud),'For din lokation')}
  ${metric(icon('moon'),'Månebelysning',pct(c.sky.moonFraction*100),c.sky.moonAlt>0?'Månen er oppe':'Månen er under horisonten')}
  ${metric(icon('spark'),'Mørke',c.darkness>=.99?'Mørkt':c.darkness===0?'For lyst':'Tusmørke',`Sol ${padNum(c.sky.sunAlt,0)}° over horisont`)}</div>`;}
function metric(i,label,value,foot){return `<div class="metric"><div class="metric-top">${i}<span>${label}</span></div><strong>${value}</strong><small>${esc(foot)}</small></div>`;}
function heroScore(c,peak){
  const v=verdict(c.score), score=c.score??0;
  const circ=2*Math.PI*83;
  return `<section class="hero-card ${v.tone}">
   <div class="hero-aurora" aria-hidden="true"><div class="aurora-band a1"></div><div class="aurora-band a2"></div><div class="aurora-band a3"></div><div class="starfield"></div></div>
   <div class="hero-inner"><div class="hero-copy"><div class="hero-eyebrow">${icon('spark',15)} NORDLYSSTATUS · LIGE NU</div><h2>${esc(v.label)}</h2><p>${esc(explain(c))}</p>
   <div class="hero-actions">${qualityPill(v)}<span class="hero-time">${icon('clock',14)} ${time(new Date())}</span></div>
   </div>
   <div class="gauge" role="img" aria-label="Observationsindeks ${c.score==null?'mangler':c.score+' ud af 100'}">
     <svg viewBox="0 0 200 200" class="gauge-svg"><circle cx="100" cy="100" r="83" stroke="rgba(190,250,225,.13)" stroke-width="13" fill="none"/><circle class="gauge-progress" cx="100" cy="100" r="83" stroke="#8bf2c0" stroke-width="13" fill="none" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ*(1-score/100)}" transform="rotate(-90 100 100)"/></svg>
     <div class="gauge-center"><strong>${c.score==null?'—':score}</strong><span>AF 100</span></div></div></div>
   <div class="hero-bottom"><span>${icon('info',15)} Observationsindeks · ikke % sandsynlighed</span><span>${refreshed()}</span></div>
   </section>`;
}
function bestWindow(hours){
  const p=dateRangeForecast(hours,36);
  if(!p) return `<div class="best-window"><div class="best-icon">${icon('clock',23)}</div><div><small>BEDSTE OBSERVATIONSVINDUE</small><strong>Afventer brugbare prognoser</strong><p>Kræver NOAA-data, vejrdata og mørke.</p></div></div>`;
  return `<div class="best-window"><div class="best-icon">${icon('clock',23)}</div><div><small>BEDSTE OBSERVATIONSVINDUE · NÆSTE 36 TIMER</small><strong>${fullDay(p.date)} kl. ${time(p.date)}</strong><p>Forventet observationsindeks <b>${p.score}/100</b> · skydække ${pct(p.wx?.cloud)}</p></div><button class="subtle-arrow" data-tab="forecast" aria-label="Se prognose">${icon('arrow',20)}</button></div>`;
}
function overviewView(){
 const c=current(),hours=hourGrid(),sky=c.sky,peak=dateRangeForecast(hours,36);
 const alert=topAlert();
 return `${pageHead('NORDLYS DER HVOR DU ER','Din nordlysradar',`Aktuelle forhold ved ${esc(loc().name)} · ${fullDay(new Date())}`,
   `<button class="btn-outline head-cta" data-gps="1">${icon('gps',17)} Brug min placering</button>`)}
 ${heroScore(c,peak)}
 <div class="section-gap"><span class="section-label">OBSERVATIONSFORHOLD</span><h2 class="section-h2">Hvad siger himlen?</h2></div>
 ${conditionsList(c)}
 <div class="overview-grid"><section class="panel timeline-panel">${cardTitle('De næste 24 timer', 'Time for time')}${forecastBars(hours.slice(0,24),true)}
 <div class="panel-link"><span>Vælg en time for flere detaljer</span><button data-tab="forecast">Se hele prognosen ${icon('arrow',16)}</button></div></section>
 <section class="panel side-insight">${cardTitle('Nat på vej',`Månefase`)}<div class="moon-small"><span class="moon-emoji">${moonGlyph(sky.moonPhase)}</span><div><strong>${moonPhaseName(sky.moonPhase)}</strong><span>${Math.round(sky.moonFraction*100)} % oplyst</span><small>${sky.moonAlt>0?'Månen er over horisonten':'Månen er under horisonten'}</small></div></div><div class="separator"></div>
 <div class="compact-stat"><span>Solhøjde nu</span><b>${padNum(sky.sunAlt,1)}°</b></div><div class="compact-stat"><span>Månehøjde nu</span><b>${padNum(sky.moonAlt,1)}°</b></div><button class="ghost-link" data-tab="sky">Læs om måne og mørke ${icon('arrow',16)}</button></section></div>
 ${bestWindow(hours)}
 <section class="panel feature-link-panel"><span class="feature-icon">${icon('bell',23)}</span><div><strong>Intelligente nordlysalarmer</strong><p>Få varsel om solstorme og gode observationsvinduer – også når appen er lukket, efter opsætning af push.</p></div><button class="btn-outline" data-tab="settings">Opsæt ${icon('arrow',15)}</button></section>
 <div class="overview-grid bottom-grid"><section class="panel"><div class="eyebrow-light">RUMVEJR LIGE NU</div><div class="space-quick"><div><small>Kp</small><strong>${c.kp==null?'—':padNum(c.kp,1)}</strong><span>${c.kp==null?'Afventer':kpG(c.kp)}</span></div><div><small>Bz (GSM)</small><strong>${windNum(state.space?.solar_wind?.bz,1)}</strong><span>nT</span></div><div><small>Solvind</small><strong>${windNum(state.space?.solar_wind?.speed,0)}</strong><span>km/s</span></div></div><p class="note-small">${esc(alert?shortAlert(alert):'Ingen nye geomagnetiske stormvarsler i den tilgængelige NOAA-feed.')}</p><button class="ghost-link" data-tab="storms">Åbn interaktivt nordlyskort ${icon('arrow',16)}</button></section>
 <section class="panel"><div class="eyebrow-light">PERSONLIGT NORDLYSARKIV</div><div class="log-prompt">${icon('book',31)}<div><strong>Har du set nordlys?</strong><p>Gem din observation, så du kan se, hvilke forhold der gav det bedste resultat.</p></div></div><button class="btn-primary btn-block" data-open-log="1">${icon('plus',17)} Registrer observation</button></section></div>
 ${state.weatherError?`<div class="inline-warning">${icon('warning',17)} Vejrdata: ${esc(state.weatherError)}</div>`:''}
 `;
}
function forecastBars(hours,compact=false){
  if(!hours?.length) return emptyNotice('Ingen timer at vise.');
  const maxH=compact?102:140;
  return `<div class="scroll-hint">${compact?'Træk vandret for at se flere timer':'Scroll vandret · tryk på en søjle for detaljer'} ${icon('arrow',13)}</div><div class="hour-scroll" role="region" aria-label="Nordlysindeks time for time" tabindex="0"><div class="hour-chart ${compact?'compact':''}">
    ${hours.map((c,i)=>{
      const h=c.score==null?5:Math.max(5,c.score*maxH/100);
      const col=c.score==null?'missing':c.score>=60?'high':c.score>=35?'medium':c.score>=17?'low':'verylow';
      const active=state.selectedHour!=null&&Math.abs(c.date.getTime()-state.selectedHour)<60*60000;
      const isMidnight=fmt(c.date,{hour:'2-digit'})==='00';
      return `<button class="hour-item ${active?'selected':''}" data-hour="${c.date.getTime()}" title="${esc(day(c.date))} kl. ${time(c.date)} – ${c.score??'ingen data'}" aria-label="${esc(day(c.date))} kl. ${time(c.date)}, indeks ${c.score==null?'ukendt':c.score}"><div class="hour-plot"><span class="bar-score">${c.score==null?'·':c.score}</span><div class="hour-bar ${col}" style="height:${h}px"></div></div><span class="hour-tick">${time(c.date)}</span>${isMidnight?'<span class="new-day">NY DAG</span>':''}</button>`;
    }).join('')}</div></div><div class="chart-legend"><span><i class="lg-high"></i>Gode</span><span><i class="lg-medium"></i>Mulige</span><span><i class="lg-low"></i>Begrænsede</span><span><i class="lg-missing"></i>Ukendte</span></div>`;
}
function forecastView(){
 const hours=hourGrid();const peak=dateRangeForecast(hours,72);
 const selected=state.selectedHour!=null?hours.find(c=>Math.abs(c.date.getTime()-state.selectedHour)<60000)||null:null;
 const c=selected||hours[0];
 return `${pageHead('KIG FREMAD','Nordlysprognose','De næste 72 timer · NOAA Kp-prognose + lokale vejrforhold')}
 <div class="section-note">${icon('info',16)} Prognoser længere fremme er mere usikre. NOAAs nordlysoval benyttes kun tæt på dens prognosetidspunkt; resten bygger primært på Kp-prognoser.</div>
 <section class="panel forecast-panel">${cardTitle('Observationsindeks',`${state.settings.mode==='camera'?'Kameratilstand':'Med det blotte øje'}`)}${forecastBars(hours)}
 ${c?`<div class="hour-detail"><div><small>${selected?'VALGT TIME':'NÆRMESTE HELE TIME'}</small><h3>${fullDay(c.date)}, kl. ${time(c.date)}</h3><span>${qualityPill(verdict(c.score))}</span><p>${esc(explain(c))}</p></div><div class="hour-detail-metrics"><span><small>Indeks</small><b>${c.score??'—'}</b></span><span><small>Kp</small><b>${padNum(c.kp,1)}</b></span><span><small>Skyer</small><b>${pct(c.wx?.cloud)}</b></span><span><small>Sol</small><b>${padNum(c.sky.sunAlt,0)}°</b></span></div></div>`:''}</section>
 <div class="section-gap"><span class="section-label">OPSUMMERING</span><h2 class="section-h2">Hvornår skal du holde øje?</h2></div>
 <div class="forecast-stat-grid"><section class="panel forecast-stat">${icon('spark',24)}<small>BEDSTE TIME NÆSTE 72 TIMER</small><strong>${peak?day(peak.date)+' '+time(peak.date):'Ingen sikker prognose'}</strong><span>${peak?`Indeks ${peak.score} · ${verdict(peak.score).short}`:'Afventer brugbare data i de mørke timer'}</span></section>
 <section class="panel forecast-stat">${icon('cloud',24)}<small>KLARESTE NATTETIME</small>${clearestHour(hours)}</section>
 <section class="panel forecast-stat">${icon('sun',24)}<small>KRAFTIGSTE Kp I PROGNOSEN</small>${strongestKp(hours)}</section></div>
 <section class="panel"><div class="card-heading"><h3>Time for time</h3><span>Klik for at undersøge en time</span></div><div class="forecast-table">${hours.filter((_,i)=>i%3===0).map(c=>`<button class="forecast-row" data-hour="${c.date.getTime()}"><span>${day(c.date)}<b>kl. ${time(c.date)}</b></span><span>Kp ${padNum(c.kp,1)}<small>${c.kpSource||'Ingen prognose'}</small></span><span>Skyer ${pct(c.wx?.cloud)}<small>${c.sky.sunAlt<-12?'Mørkt':'Lyst/tusmørke'}</small></span><span class="score-mini ${verdict(c.score).tone}">${c.score??'—'}</span></button>`).join('')}</div></section>`;
}
function clearestHour(hours){const a=hours.filter(x=>x.wx?.cloud!=null&&x.sky.sunAlt<-10).sort((a,b)=>a.wx.cloud-b.wx.cloud)[0];return `<strong>${a?day(a.date)+' '+time(a.date):'—'}</strong><span>${a?pct(a.wx.cloud)+' skydække':'Ingen brugbare vejrdata'}</span>`;}
function strongestKp(hours){const a=hours.filter(x=>x.kp!=null&&x.forecastType==='predicted').sort((a,b)=>b.kp-a.kp)[0];return `<strong>${a?padNum(a.kp,1)+' '+kpG(a.kp):'—'}</strong><span>${a?day(a.date)+' kl. '+time(a.date):'Afventer NOAA-prognose'}</span>`;}
function skyView(){
 const now=new Date(),sky=skyAt(now,loc().lat,loc().lon),events=nextMoonEvents(now,loc().lat,loc().lon),currentWx=current().wx;
 const dates=Array.from({length:8},(_,i)=>new Date(now.getTime()+i*24*3600000));
 return `${pageHead('NATTENS FORHOLD','Måne & mørke','Den mørke himmel er mindst lige så vigtig som solstormen.')}
 <div class="moon-overview"><section class="panel moon-main"><div class="moon-disc-wrap"><div class="moon-disc" aria-hidden="true"><div class="moon-shade"></div></div><span class="moon-glyph" aria-hidden="true">${moonGlyph(sky.moonPhase)}</span></div><div class="moon-copy"><span class="eyebrow-light">MÅNEN LIGE NU</span><h2>${moonPhaseName(sky.moonPhase)}</h2><div class="giant-fraction">${Math.round(sky.moonFraction*100)}<span>%</span></div><p>af månens skive er belyst</p>${sky.moonAlt>0?'<span class="moon-pill">Månen er over horisonten</span>':'<span class="moon-pill great">Månen er under horisonten</span>'}</div></section>
 <section class="panel moon-facts">${cardTitle('Vigtige tidspunkter')}<div class="sky-fact">${icon('moon',22)}<div><small>NÆSTE MÅNEOPGANG</small><strong>${events.rise?day(events.rise)+' · '+time(events.rise):'Ukendt'}</strong></div></div><div class="sky-fact">${icon('moon',22)}<div><small>NÆSTE MÅNENEDGANG</small><strong>${events.set?day(events.set)+' · '+time(events.set):'Ukendt'}</strong></div></div><div class="sky-fact">${icon('spark',22)}<div><small>MÅNENS HØJDE NU</small><strong>${padNum(sky.moonAlt,1)}°</strong></div></div><div class="sky-fact">${icon('sun',22)}<div><small>SOLENS HØJDE NU</small><strong>${padNum(sky.sunAlt,1)}°</strong></div></div></section></div>
 <div class="section-gap"><span class="section-label">MÅNEKALENDER</span><h2 class="section-h2">Månen de næste 8 dage</h2></div><section class="panel moon-calendar">${dates.map(d=>{const s=skyAt(d,loc().lat,loc().lon);return `<div class="moon-day"><span class="moon-icon-small">${moonGlyph(s.moonPhase)}</span><b>${day(d)}</b><span>${Math.round(s.moonFraction*100)} %</span><small>${moonPhaseName(s.moonPhase)}</small></div>`;}).join('')}</section>
 <div class="overview-grid"><section class="panel">${cardTitle('Skyerne netop nu','Open-Meteo')}<div class="cloud-grid">${[['Lave',currentWx?.low],['Mellemhøje',currentWx?.mid],['Høje',currentWx?.high]].map(([label,p])=>`<div><span>${label}</span><b>${pct(p)}</b><div class="progress-track"><i style="width:${p??0}%"></i></div></div>`).join('')}</div><p class="note-small">Lave, mellemhøje og høje skyer er ikke additive. Samlet skydække: <b>${pct(currentWx?.cloud)}</b>.</p></section>
 <section class="panel sky-explainer">${cardTitle('Hvornår er himlen mørk?')}<div class="darkness-list"><span><i class="night-dot full"></i> Sol under −18°<b>Astronomisk mørke</b></span><span><i class="night-dot part"></i> −12° til −18°<b>Astronomisk tusmørke</b></span><span><i class="night-dot light"></i> Over −4°<b>For lyst til nordlys</b></span></div><p class="note-small">Nymåne giver bedst kontrast, men en lys fuldmåne under horisonten gør ikke himlen lysere.</p></section></div>`;
}
function windNum(v,decimals){return v==null||!Number.isFinite(Number(v))?'—':padNum(v,decimals);}
function topAlert(){
 const rows=state.space?.alerts||[];
 if(!Array.isArray(rows))return null;
 const sorted=[...rows].sort((a,b)=>(utc(b.time)?.getTime()||0)-(utc(a.time)?.getTime()||0));
 const latestPerId=[];const seen=new Set();
 for(const a of sorted){if(seen.has(a.id))continue;seen.add(a.id);latestPerId.push(a);}
 return latestPerId.find(a=>a.id?.startsWith('A') && /WATCH:/i.test(a.message||'') && !/CANCEL WATCH/i.test(a.message||'')&&Date.now()-(utc(a.time)?.getTime()||0)<3*86400000) || null;
}
function shortAlert(a){return (a?.message||'').match(/WATCH:\s*([^\n\r]+)/i)?.[1]?.trim()||'NOAA har udstedt et geomagnetisk stormvarsel.';}
function stormsView(){
 const c=current(),s=state.space||{},wind=s.solar_wind||{},alerts=(s.alerts||[]).slice(0,8),storms=groupStorms(state.history.length?state.history:(s.kp||[]).filter(r=>r.kind==='observed'));
 const last=wind.time?since(wind.time):'Måling mangler';
 return `${pageHead('DET STARTER PÅ SOLEN','Solstorme & nordlys','Målinger fra NOAA Space Weather Prediction Center')}
 <div class="storm-grid"><section class="panel"><div class="eyebrow-light">GEOMAGNETISK AKTIVITET</div><div class="kp-big"><strong>${padNum(c.kp,1)}</strong><span>${c.kp==null?'Afventer NOAA':kpG(c.kp)}</span></div><p class="note-small">Planetarisk Kp-indeks · ${c.kpSource||'ingen aktuel måling'}. Skala 0–9. G1 begynder ved omtrent Kp 5.</p><div class="thin-divider"></div><div class="big-split"><div><small>Bz (GSM)</small><b>${windNum(wind.bz,1)} nT</b></div><div><small>Solvind</small><b>${windNum(wind.speed,0)} km/s</b></div></div><p class="note-small">${esc(last)} · Negativ Bz kan øge koblingen mellem solvinden og Jordens magnetfelt.</p></section>
 </div>
 <section class="panel radar-panel live-map-card">${cardTitle('Interaktivt nordlyskort','NOAA OVATION · 30–90 minutter')}<div class="live-map-head"><div><span class="map-live-chip">${s.aurora?.forecast_time?'Prognose '+esc(day(utc(s.aurora.forecast_time))+' '+time(utc(s.aurora.forecast_time))):'Afventer NOAA'}</span></div><label class="map-toggle"><input type="checkbox" data-map-overlay ${state.showAuroraOverlay?'checked':''}> Vis nordlyszone</label></div><div class="interactive-map-container"><canvas id="interactiveAuroraMap" aria-label="Interaktivt nordlyskort. Træk for at flytte kortet, knib for at zoome, eller tryk på et sted for at undersøge intensiteten." tabindex="0"></canvas><div class="map-controls"><button type="button" data-map-zoom="in" title="Zoom ind" aria-label="Zoom ind">+</button><button type="button" data-map-zoom="out" title="Zoom ud" aria-label="Zoom ud">−</button><button type="button" data-map-reset="1" title="Centrer ved dig" aria-label="Centrer ved dig">${icon('gps',18)}</button></div><div class="map-osm">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a></div></div><div class="map-legend-gradient"><span>Lav modelintensitet</span><div></div><span>Høj modelintensitet</span></div><p id="map-point-info" class="map-point-info" aria-live="polite">Træk i kortet, zoom med +/−, og tryk på et sted for at se NOAAs beregnede aktivitet. Intensitet er ikke sandsynlighed for synligt nordlys.</p><p class="note-small">Din placering markeres med en hvid prik. Nordlys kan også ses mod den nordlige horisont uden at være direkte over dig. Kortet bruger OpenStreetMap og kræver internet.</p>${!s.aurora?.forecast_time?emptyNotice('Kortet afventer en NOAA-prognose.'):Math.abs(Date.now()-(utc(s.aurora.forecast_time)?.getTime()||0))>=2*3600000?emptyNotice('NOAA-prognosen er forældet; overlayet er skjult, indtil en ny måling er klar.'):s.aurora.points?.length===0?emptyNotice('Ingen aktiv nordlyszone i den seneste model.'):''}</section>
 <div class="section-gap"><span class="section-label">NOAA-VARSLER</span><h2 class="section-h2">Seneste rumvejrsmeddelelser</h2></div><section class="panel alerts-panel">${alerts.length?alerts.map(a=>{const message=(a.message||'').match(/(?:WATCH|ALERT|WARNING|CANCEL WATCH):[^\r\n]*/i)?.[0]||a.message?.split('\n')[0]||'Meddelelse';return `<div class="alert-item"><span class="alert-icon">${icon('sun',18)}</span><div><b>${esc(message.slice(0,175))}</b><small>${esc(a.id||'NOAA')} · ${esc(a.time?day(utc(a.time))+' '+time(utc(a.time)):'Ukendt')}</small></div></div>`;}).join(''):emptyNotice('Ingen meddelelser tilgængelige i NOAAs feed.')}</section>
 <div class="section-gap"><span class="section-label">HISTORISKE HÆNDELSER</span><h2 class="section-h2">Registrerede geomagnetiske storme</h2></div><section class="panel history-panel">${storms.length?storms.slice(0,24).map(st=>`<div class="history-item"><div class="storm-date"><strong>${day(utc(st.start))}</strong><small>Fra kl. ${time(utc(st.start))}</small></div><div class="storm-level">${esc(st.g)}<span>maks. Kp ${padNum(st.peak,1)}</span></div><div class="storm-length">${st.samples===1?'Én måleperiode':`${st.samples} måleperioder`}</div></div>`).join(''):emptyNotice('Ingen stormperioder i den tilgængelige historik. Historikken opbygges efter første NOAA-opdatering.')}
 <div class="disclaimer-strip">${icon('info',16)} Historik er observerede Kp-perioder (G1+), samlet til hændelser. Historikken går op til 90 dage tilbage, efterhånden som appen indsamler data.</div></section>`;
}
function placesView(){
 return `${pageHead('LOKALT VEJR','Mine steder','Nordlys ser forskelligt ud alt efter hvor du står og ser mod nord.')}
 <section class="panel location-search-panel">${cardTitle('Find en lokation','Verdensomspændende')}<form id="placeSearchForm" class="search-row"><label class="search-input">${icon('search',19)}<input id="locationQuery" type="search" name="query" required minlength="2" placeholder="Søg by eller sted, fx Hornbæk" autocomplete="off" aria-label="Søg efter en lokation" /></label><button type="submit" class="btn-primary">${state.geocodeBusy?'Søger …':'Søg'}</button></form><div id="searchResults" class="search-results">${state.geocodeResults.map((p,i)=>`<button data-pick-result="${i}">${icon('pin',17)}<span>${esc(p.name)}<small>${esc(p.region||p.country)}</small></span>${icon('plus',18)}</button>`).join('')}</div><button class="btn-outline gps-action" data-gps="1">${icon('gps',17)} Brug telefonens GPS</button></section>
 <div class="section-gap"><span class="section-label">GEMTE STEDER</span><h2 class="section-h2">Sammenlign himlen</h2></div><section class="places-list">${state.settings.places.map((p,i)=>placeCard(p,i)).join('')}</section>
 <section class="panel tip-panel">${icon('compass',24)}<div><strong>Et godt sted at kigge mod nord</strong><p>Vælg en mørk placering med fri horisont, fx ved en nordvendt kyst. Appen bruger den samme manuelt valgte lysforureningskategori til alle gemte steder, så den sammenligning skal du også tage højde for.</p></div></section>`;
}
function placeCard(place,index){
 const currentPlace=place.lat===loc().lat && place.lon===loc().lon;
 const w=currentPlace?state.weather:state.locationsWx[place.lat+','+place.lon];
 const c=conditionsFor(new Date(),place,effSpace(),w,state.settings);
 const peak=w?dateRangeForecast(buildHours(new Date(),place,effSpace(),w,state.settings,36),36):null;
 if(!w && !currentPlace) queuePlaceWeather(place);
 return `<article class="place-card ${currentPlace?'is-current':''}"><div class="place-icon">${icon('pin',20)}</div><div class="place-description"><strong>${esc(place.name)}${currentPlace?'<span>VALGT</span>':''}</strong><small>${esc(place.region||'')}${place.region?' · ':''}${padNum(place.lat,2)}° N</small><div class="place-stats"><span>${icon('cloud',14)} ${pct(c.wx?.cloud)} skyer</span><span>${icon('spark',14)} Nu ${c.score??'—'} · Bedst ${peak?.score??'—'}</span></div></div><div class="place-actions">${currentPlace?'<span class="place-selected">'+icon('check',19)+'</span>':`<button class="mini-button" data-set-place="${index}">Vælg</button>`}${!currentPlace?`<button class="icon-button quiet" title="Fjern sted" data-remove-place="${index}" aria-label="Fjern ${esc(place.name)}">${icon('x',17)}</button>`:''}</div></article>`;
}
function settingsView(){
 const s=state.settings;
 return `${pageHead('PERSONLIG OPSÆTNING','Indstillinger','Tilpas varsler og beregninger til den måde, du leder efter nordlys på.')}
 <div class="settings-stack"><section class="panel settings-section">${cardTitle('Observationsmetode')}<p class="settings-help">Det blotte øje kræver stærkere lys end et kamera med lang eksponering.</p><div class="radio-tiles"><label class="choice-tile ${s.mode==='eye'?'chosen':''}"><input type="radio" name="mode" value="eye" ${checked(s.mode==='eye')}><span>${icon('eye',23)}</span><b>Med øjet</b><small>Konservativ vurdering</small></label><label class="choice-tile ${s.mode==='camera'?'chosen':''}"><input type="radio" name="mode" value="camera" ${checked(s.mode==='camera')}><span>${icon('camera',23)}</span><b>Med kamera</b><small>Svagt nordlys kan ses på fotos</small></label></div></section>
 <section class="panel settings-section">${cardTitle('Lysforurening')}<p class="settings-help">Vælg selv, hvor mørkt dit observationssted er. Det er ikke automatisk målt.</p><div class="radio-tiles three">${[['city','By','Bylys omkring dig'],['suburb','Forstad','Noget spredt lys'],['dark','Mørkt sted','Meget lidt lys']].map(([v,label,sub])=>`<label class="choice-tile ${s.light===v?'chosen':''}"><input type="radio" name="light" value="${v}" ${checked(s.light===v)}><span>${icon('spark',20)}</span><b>${label}</b><small>${sub}</small></label>`).join('')}</div></section>
 <section class="panel settings-section">${cardTitle('Intelligente nordlysalarmer')}<p class="settings-help">Alarmer vurderer samlet nordlysindeks, skydække og mørke. Du kan få besked om gode forhold lige nu, om et observationsvindue inden for seks timer eller om en kraftig geomagnetisk storm inden for to døgn.</p>
 <div class="setting-row"><div><b>Aktivér nordlysalarmer</b><span>I appen straks; på iPhone i baggrunden efter push-opsætning</span></div><label class="toggle"><input type="checkbox" name="alerts" ${checked(s.alerts)}/><i></i></label></div>
 <div class="setting-row"><div><b>Gode forhold lige nu</b><span>Kræver mørke, acceptabelt skydække og høj score</span></div><label class="toggle"><input type="checkbox" name="alertNow" ${checked(s.alertNow)}/><i></i></label></div>
 <div class="setting-row"><div><b>Nordlys inden for seks timer</b><span>Tidligt varsel om et muligt observationsvindue</span></div><label class="toggle"><input type="checkbox" name="alertSoon" ${checked(s.alertSoon)}/><i></i></label></div>
 <div class="setting-row"><div><b>Forvarsel om solstorm</b><span>Den valgte stormstyrke i den kommende 48-timers NOAA-prognose</span></div><label class="toggle"><input type="checkbox" name="alertStorm" ${checked(s.alertStorm)}/><i></i></label></div>
 <div class="setting-row"><div><b>Opdater automatisk</b><span>Cirka hvert femte minut, mens appen er åben</span></div><label class="toggle"><input type="checkbox" name="autoRefresh" ${checked(s.autoRefresh)}/><i></i></label></div>
 <div class="range-box"><label for="alertThreshold">Minimum observationsindeks <strong>${s.alertThreshold}/100</strong></label><input type="range" id="alertThreshold" name="alertThreshold" min="20" max="90" step="5" value="${s.alertThreshold}" /><div class="range-label"><span>Flere alarmer</span><span>Kun stærke muligheder</span></div></div>
 <div class="range-box storm-range"><label for="alertStormKp">Solstormniveau for forvarsler <strong>${kpG(s.alertStormKp)} · Kp ${s.alertStormKp}+</strong></label><input type="range" id="alertStormKp" name="alertStormKp" min="5" max="9" step="1" value="${s.alertStormKp}" /><div class="range-label"><span>G1 (Kp 5)</span><span>G5 (Kp 9)</span></div></div>
 <div class="setting-row"><div><b>Stilleperiode (valgfri)</b><span>Ingen push eller alarm i disse timer. Angiv begge tider.</span></div><div class="quiet-hours"><input type="time" name="quietStart" value="${esc(s.quietStart||'')}" aria-label="Stilleperiode starter"><span>til</span><input type="time" name="quietEnd" value="${esc(s.quietEnd||'')}" aria-label="Stilleperiode slutter"></div></div>
 <div class="setup-separator"></div>
 <h4 class="section-mini-title">Pushbeskeder, når appen er lukket</h4><p class="settings-help">Gratis med <a href="https://ntfy.sh/" target="_blank" rel="noopener noreferrer">ntfy til iPhone</a> og GitHub Actions. Vores privatlivsvenlige løsning kræver én hemmelig GitHub-indstilling. Din adresse og din alarmnøgle lægges ikke i de offentlige webfiler.</p>
 <div class="setup-steps"><div><b>1</b><p>Installer <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener noreferrer">ntfy på iPhone</a>. Opret en tilfældig personlig kanal her i appen.</p></div><div><b>2</b><p>Kopiér kanalnavnet, og tryk <b>Subscribe</b> i ntfy for at abonnere på præcis denne kanal.</p></div><div><b>3</b><p>Kopiér GitHub-hemmeligheden. Gå til repository → Settings → Secrets and variables → Actions → New repository secret. Navn: <code>NORDLYS_ALERT_CONFIG</code>. Indsæt den kopierede JSON som værdi.</p></div><div><b>4</b><p>Kør workflowet <b>Personlige nordlysalarmer</b> under Actions med <b>Send en test-push</b> markeret. Kontroller, at beskeden kommer. Fremover tjekkes cirka hvert 15. minut, men GitHub kan forsinke kørslerne.</p></div></div>
 <div class="push-key-card"><small>DIN PRIVATE NTFY-KANAL</small><code>${s.pushTopic?esc(s.pushTopic):'Ingen kanal oprettet'}</code><div class="action-row"><button class="btn-outline" data-generate-topic="1">${icon('bell',16)} ${s.pushTopic?'Opret ny kanal':'Opret alarmkanal'}</button>${s.pushTopic?`<button class="btn-outline" data-copy-topic="1">${icon('save',16)} Kopiér kanal</button><button class="btn-primary" data-copy-config="1">${icon('download',16)} Kopiér GitHub-hemmelighed</button>`:''}</div><small class="push-disclaimer">Kanalnavnet er en hemmelig adgangsnøgle. Del det ikke. ntfy.sh er en ekstern tjeneste, og kanaler er ikke private konti. Ved nye indstillinger skal GitHub-hemmeligheden kopieres ind igen.</small></div></section>
 <section class="panel settings-section">${cardTitle('iPhone-widget','Scriptable')}<p class="settings-help">En ægte hjemmeskærmswidget med observationsindeks, Kp, skyer og månebelysning. Den kræver gratisappen <a href="https://apps.apple.com/app/scriptable/id1405459188" target="_blank" rel="noopener noreferrer">Scriptable</a>, da iPhone ikke understøtter native widgets direkte fra GitHub Pages. Opdateringen styres af iOS.</p><div class="action-row"><a class="btn-outline" href="./widget/Nordlysradar.js" download="Nordlysradar.js">${icon('download',17)} Hent widget-script</a><button class="btn-primary" data-copy-widget-parameter="1">${icon('save',17)} Kopiér min widget-placering</button></div><div class="widget-setup"><b>Sådan aktiverer du den</b><p>Åbn Scriptable → opret scriptet <b>Nordlysradar</b> og indsæt indholdet fra filen. Tilføj en <b>Scriptable-widget</b> til hjemmeskærmen, vælg scriptet og indsæt den kopierede værdi som <b>Widget Parameter</b>.</p><small>Bemærk: Hvis dit GitHub Pages-site har en anden URL end standardadressen, skal <code>APP_URL</code> i widgetfilens første linjer rettes.</small></div></section>
 <section class="panel settings-section">${cardTitle('Dine data')}<p class="settings-help">Steder, indstillinger og dine egne observationer gemmes kun lokalt i denne browser. Brug backup, hvis du vil flytte dem til en anden telefon.</p><div class="action-row"><button class="btn-outline" data-export="1">${icon('download',17)} Eksporter backup</button><label class="btn-outline file-label">${icon('upload',17)} Importer backup<input type="file" id="importFile" accept="application/json,.json" hidden /></label></div></section>
 <section class="panel settings-section about-section">${cardTitle('Sådan fungerer scoren')}<p>Vores observationsindeks (0–100) er en vejledende model og <b>ikke en beregnet sandsynlighed i procent</b>. Det kombinerer:</p><div class="science-list"><div><b>Rumvejr</b><span>NOAA Kp og NOAAs nordlysoval tæt på nuværende tidspunkt</span></div><div><b>Vejr</b><span>Samlet skydække og sigtbarhed fra Open-Meteo</span></div><div><b>Astronomi</b><span>Solens højde, måneposition og månens lysstyrke</span></div><div><b>Lokalt</b><span>GPS-koordinater, observationsmetode og manuelt valgt lysforurening</span></div></div><p class="settings-help">Kp er globalt, og geografisk breddegrad er ikke det samme som geomagnetisk breddegrad. Prognosen er derfor vejledende; særligt fremtidsvurderinger er usikre.</p><div class="source-links"><a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener noreferrer">NOAA / SWPC ${icon('arrow',15)}</a><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo ${icon('arrow',15)}</a></div></section>
 <div class="section-gap"><span class="section-label">DINE OPLEVELSER</span><h2 class="section-h2">Observationsdagbog</h2></div><button class="btn-primary" data-open-log="1">${icon('plus',17)} Registrer ny observation</button>
 ${observationSection()}
 <section class="panel install-tip">${icon('plus',20)}<div><strong>Føj Nordlysradar til hjemmeskærmen</strong><p>iPhone: Åbn siden i Safari, tryk Del, og vælg “Føj til hjemmeskærm”. Android: brug browserens “Installer app”.</p></div></section></div>`;
}
function logDialog(){
 return `<dialog id="logDialog" class="log-dialog" aria-labelledby="logTitle"><form id="logForm"><div class="dialog-header"><div><div class="kicker">DIN NORDLYSDAGBOG</div><h2 id="logTitle">Registrer observation</h2></div><button type="button" class="icon-button" data-close-log="1" aria-label="Luk dialog">${icon('x',19)}</button></div><div class="dialog-body"><label>Dato og klokkeslæt<input type="datetime-local" id="logDate" required /></label><label>Så du nordlys?<select id="logSeen"><option value="yes">Ja, med det blotte øje</option><option value="camera">Kun på kamera</option><option value="no">Nej, intet synligt</option></select></label><label>Din beskrivelse<textarea id="logNote" maxlength="300" rows="3" placeholder="Farver, retning, intensitet, hvad du oplevede …"></textarea></label><div class="note-small">Vi gemmer aktuelle målinger sammen med noten, hvis de er tilgængelige.</div></div><div class="dialog-footer"><button type="button" class="btn-outline" data-close-log="1">Annuller</button><button type="submit" class="btn-primary">${icon('save',17)} Gem observation</button></div></form></dialog>`;
}
function observationSection(){
 if(!state.observations.length) return `<section class="panel log-empty"><div>${icon('book',27)}</div><h3>Ingen observationer endnu</h3><p>Når du finder nordlys, kan du gemme oplevelsen her.</p><button class="btn-primary" data-open-log="1">${icon('plus',17)} Tilføj observation</button></section>`;
 return `<section class="panel">${cardTitle('Mine observationer',`${state.observations.length} registreringer`)}${state.observations.map(o=>`<div class="observation-item"><div class="observation-icon">${o.seen==='no'?'·':icon('spark',20)}</div><div><strong>${esc(o.seen==='yes'?'Synligt nordlys':o.seen==='camera'?'Nordlys på foto':'Intet nordlys')}</strong><small>${esc(o.date?day(new Date(o.date))+' kl. '+time(new Date(o.date)):'Ukendt')} · ${esc(o.location||'Ukendt')}</small><p>${esc(o.note||'Ingen beskrivelse')}</p><small>Kp ${o.kp??'—'} · Skydække ${o.cloud==null?'—':o.cloud+' %'}</small></div><button class="icon-button quiet" data-delete-log="${esc(o.id)}" title="Slet observation" aria-label="Slet observation">${icon('x',16)}</button></div>`).join('')}</section>`;
}
let toastTimer;
function toast(message){state.toast=message;render();clearTimeout(toastTimer);toastTimer=setTimeout(()=>{state.toast=null;render();},4200);}
function render(){
 // For a continuous single-page interface, replacing the view keeps event wiring delegated.
 const y=window.scrollY;
 document.querySelector('#app').innerHTML=shell();
 if(state.tab==='storms') requestAnimationFrame(()=>initAuroraMap(document.querySelector('#interactiveAuroraMap'),state.space?.aurora,loc(),{camera:state.mapCamera,overlay:state.showAuroraOverlay,onCameraChange:camera=>{state.mapCamera=camera;},onOverlayChange:active=>{state.showAuroraOverlay=active;}}));
 if(state.tab==='places') updatePlaceResults();
 requestAnimationFrame(()=>window.scrollTo({top:y,behavior:'instant'}));
}
function updatePlaceResults(){const node=document.querySelector('#searchResults');if(!node)return;
 node.innerHTML=state.geocodeResults.map((p,i)=>`<button data-pick-result="${i}">${icon('pin',17)}<span>${esc(p.name)}<small>${esc(p.region||p.country)}</small></span>${icon('plus',18)}</button>`).join('');
}
function setLocation(p){
 if(!isLocation(p))return;
 state.settings.location=p;
 if(!state.settings.places.some(x=>Math.abs(x.lat-p.lat)<.001 && Math.abs(x.lon-p.lon)<.001))state.settings.places.push(p);
 state.settings.places=state.settings.places.slice(-12);saveSettings(state.settings);state.weather=null;state.weatherError='';state.mapCamera=null;state.tab='overview';state.selectedHour=null;render();refreshWeather();
}
async function refreshWeather(){
 const requested={...loc()};
 try{const d=await getWeather(requested);state.locationsWx[requested.lat+','+requested.lon]=d;
  if(loc().lat===requested.lat&&loc().lon===requested.lon){state.weather=d;state.weatherError='';}
 }catch(err){if(loc().lat===requested.lat&&loc().lon===requested.lon){state.weather=null;state.weatherError='Open-Meteo kunne ikke kontaktes. Kontrollér forbindelsen.';}}
 render();
}
async function refreshAll(force=false){
 if(state.loading) return;
 state.loading=true;render();
 const requested={...loc()};
 const [sp,hx,wx]=await Promise.allSettled([getSpace(),getHistory(),getWeather(requested)]);
 if(sp.status==='fulfilled'){state.space=sp.value;state.spaceError='';}else{state.spaceError='NOAA-data kunne ikke hentes';}
 if(hx.status==='fulfilled')state.history=hx.value;
 if(wx.status==='fulfilled'){
   state.locationsWx[requested.lat+','+requested.lon]=wx.value;
   if(loc().lat===requested.lat&&loc().lon===requested.lon){state.weather=wx.value;state.weatherError='';}
 }else if(loc().lat===requested.lat&&loc().lon===requested.lon){state.weather=null;state.weatherError='Open-Meteo kunne ikke kontaktes.';}
 state.loading=false;state.lastFetch=Date.now();render();checkAlert();
}
const weatherPending=new Set();
function queuePlaceWeather(p){
 const key=p.lat+','+p.lon;
 if(weatherPending.has(key)||state.locationsWx[key])return;
 weatherPending.add(key);
 getWeather(p).then(w=>{state.locationsWx[key]=w;if(state.tab==='places')render();}).catch(()=>{}).finally(()=>weatherPending.delete(key));
}
async function gps(){
 if(!navigator.geolocation){toast('Din browser understøtter ikke GPS.');return;}
 toast('Finder din placering …');
 navigator.geolocation.getCurrentPosition(r=>{
   const p={name:'Min placering',region:'GPS',lat:Number(r.coords.latitude.toFixed(5)),lon:Number(r.coords.longitude.toFixed(5))};
   setLocation(p);toast('Placeringen er opdateret.');
 },()=>toast('GPS blev ikke tilladt. Du kan søge efter et sted i stedet.'),{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
}
function checkAlert(){
 if(!state.settings.alerts||!state.weather||!state.space?.kp?.length)return;
 const key='nordlysradar.alertState.v1';
 let last={};try{last=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
 const now=new Date();
 const event=nextAlert(now,loc(),effSpace(),state.weather,{...state.settings,timezone:state.weather.timezone||'Europe/Copenhagen'},last);
 if(!event)return;
 localStorage.setItem(key,JSON.stringify(recordAlert(last,event,now)));
 toast(`${event.title}: ${event.message}`);
}
function openLog(){const dialog=document.querySelector('#logDialog');if(!dialog)return;
 const d=new Date();const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
 dialog.querySelector('#logDate').value=local;dialog.showModal();}
function closeLog(){const dialog=document.querySelector('#logDialog');if(dialog?.open)dialog.close();}
function addLog(form){
 const d=form.querySelector('#logDate').value, seen=form.querySelector('#logSeen').value, note=form.querySelector('#logNote').value.trim();
 const timestamp=new Date(d);
 if(!d||isNaN(timestamp.getTime())){toast('Vælg en gyldig dato.');return;}
 const c=conditionsFor(timestamp,loc(),effSpace(),state.weather,state.settings);
 const o={id:String(Date.now())+'-'+Math.random().toString(16).slice(2,7),date:timestamp.toISOString(),seen,note,location:loc().name,kp:c.kp,cloud:c.wx?.cloud??null,score:c.score};
 state.observations.unshift(o);state.observations=state.observations.slice(0,300);
 try{saveLog(state.observations);}catch{state.observations.shift();toast('Lageret er fyldt. Eksporter en backup og ryd op.');return;}
 closeLog();state.tab='settings';render();toast('Din observation er gemt lokalt.');
}
function updateSettings(e){
 const t=e.target,name=t.name;if(!name||!(name in state.settings))return;
 const value=t.type==='checkbox'?t.checked:t.type==='range'?Number(t.value):t.value;
 state.settings[name]=value;saveSettings(state.settings);render();
}
function setTab(tab){
 if(tab==='logs'){state.tab='settings';render();requestAnimationFrame(()=>document.querySelector('.settings-stack')?.scrollIntoView());return;}
 if(!TABS.some(([id])=>id===tab))return;
 state.tab=tab;state.selectedHour=null;window.scrollTo({top:0,behavior:'instant'});render();
}

function generateTopic(){
 if(!window.crypto?.getRandomValues){toast('Din browser understøtter ikke sikre tilfældige nøgler.');return;}
 if(state.settings.pushTopic&&!window.confirm('Den gamle ntfy-kanal stopper med at få nye pushbeskeder efter du opdaterer GitHub-secret. Opret en ny?'))return;
 const bytes=new Uint8Array(22);window.crypto.getRandomValues(bytes);
 state.settings.pushTopic='nordlys-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 saveSettings(state.settings);render();toast('Din private alarmkanal er oprettet.');
}
function githubAlertConfig(){
 const s=state.settings; if(!s.pushTopic)return null;
 return JSON.stringify({schema_version:1,location:{name:loc().name,lat:loc().lat,lon:loc().lon},
  light:s.light,mode:s.mode,alerts:s.alerts,alertThreshold:Number(s.alertThreshold),
  alertNow:s.alertNow!==false,alertSoon:s.alertSoon!==false,alertStorm:s.alertStorm!==false,alertStormKp:Number(s.alertStormKp),
  quietStart:s.quietStart||'',quietEnd:s.quietEnd||'',
  timezone:state.weather?.timezone||'Europe/Copenhagen',ntfyServer:'https://ntfy.sh/',ntfyTopic:s.pushTopic},null,2);
}
async function copyText(value,message){
 try {await navigator.clipboard.writeText(value);toast(message);}
 catch{
  const input=document.createElement('textarea');input.value=value;input.setAttribute('readonly','');
  input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();
  const worked=document.execCommand('copy');input.remove();toast(worked?message:'Kopiering blev blokeret. Brug en HTTPS-forbindelse og prøv igen.');
 }
}
document.addEventListener('click',async (event)=>{
 const btn=event.target.closest('button,[data-export],label.file-label');if(!btn)return;
 if(btn.dataset.tab){setTab(btn.dataset.tab);return;}
 if(btn.dataset.generateTopic){generateTopic();return;}
 if(btn.dataset.copyTopic){if(state.settings.pushTopic)await copyText(state.settings.pushTopic,'Alarmkanal kopieret. Abonnér på den i ntfy.');return;}
 if(btn.dataset.copyConfig){const value=githubAlertConfig();if(value)await copyText(value,'JSON kopieret. Opret eller opdater NORDLYS_ALERT_CONFIG under GitHub Secrets.');return;}
 if(btn.dataset.copyWidgetParameter){await copyText(`${loc().lat},${loc().lon},${loc().name.replaceAll(',',' ')},${state.settings.light},${state.settings.mode}`,'Widget-parameter er kopieret. Indsæt den i Scriptable-widgettens indstillinger.');return;}
 if(btn.dataset.refresh){refreshAll(true);return;}
 if(btn.dataset.gps){gps();return;}
 if(btn.dataset.hour){state.selectedHour=Number(btn.dataset.hour);state.tab='forecast';render();return;}
 if(btn.dataset.openLog){openLog();return;}
 if(btn.dataset.closeLog){closeLog();return;}
 if(btn.dataset.pickResult!=null){const p=state.geocodeResults[Number(btn.dataset.pickResult)];if(p){state.geocodeResults=[];setLocation(p);}return;}
 if(btn.dataset.setPlace!=null){const p=state.settings.places[Number(btn.dataset.setPlace)];if(p)setLocation(p);return;}
 if(btn.dataset.removePlace!=null){const index=Number(btn.dataset.removePlace);const p=state.settings.places[index];if(!p||p.lat===loc().lat&&p.lon===loc().lon)return;
  state.settings.places.splice(index,1);saveSettings(state.settings);render();return;}
 if(btn.dataset.export){exportBackup(state.settings,state.observations);return;}
 if(btn.dataset.deleteLog){if(!window.confirm('Vil du slette denne observation?'))return;
  state.observations=state.observations.filter(o=>o.id!==btn.dataset.deleteLog);saveLog(state.observations);render();return;}
});
document.addEventListener('submit',async event=>{
 if(event.target.id==='placeSearchForm'){
   event.preventDefault();const input=event.target.querySelector('input[name="query"]');const term=input.value.trim();if(term.length<2)return;
   state.geocodeBusy=true;const node=document.querySelector('#searchResults');node.innerHTML='<p class="results-loading">Søger efter steder …</p>';
   try{state.geocodeResults=await geocode(term);if(!state.geocodeResults.length)toast('Ingen lokationer fundet. Prøv et andet stednavn.');}
   catch{state.geocodeResults=[];toast('Søgning er ikke tilgængelig lige nu.');}
   state.geocodeBusy=false;updatePlaceResults();return;
 }
 if(event.target.id==='logForm'){event.preventDefault();addLog(event.target);}
});
document.addEventListener('change',async event=>{
 if(event.target.id==='importFile'){
  const file=event.target.files?.[0];if(!file)return;
  try{const {settings,observations}=await importBackup(file);
    if(!window.confirm('Vil du erstatte nuværende indstillinger og observationer med backupfilen?'))return;
    state.settings=settings;state.observations=observations;saveSettings(settings);saveLog(observations);
    state.weather=null;render();refreshWeather();toast('Backup er importeret.');
  }catch(e){toast('Backup kunne ikke indlæses: '+e.message);}return;
 }
 if(event.target.matches('input[name="mode"],input[name="light"],input[name="alerts"],input[name="alertNow"],input[name="alertSoon"],input[name="alertStorm"],input[name="autoRefresh"],input[name="alertThreshold"],input[name="alertStormKp"],input[name="quietStart"],input[name="quietEnd"]'))updateSettings(event);
});
document.addEventListener('input',event=>{
 if(event.target.name==='alertThreshold'){
  const label=document.querySelector('label[for="alertThreshold"] strong');if(label)label.textContent=event.target.value+'/100';
 }
 if(event.target.name==='alertStormKp'){
  const label=document.querySelector('label[for="alertStormKp"] strong');if(label)label.textContent=kpG(Number(event.target.value))+' · Kp '+event.target.value+'+';
 }
});

window.addEventListener('focus',()=>{if(state.settings.autoRefresh&&Date.now()-state.lastFetch>5*60000)refreshAll();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.settings.autoRefresh&&Date.now()-state.lastFetch>5*60000)refreshAll();});
setInterval(()=>{if(!document.hidden&&state.settings.autoRefresh&&Date.now()-state.lastFetch>=5*60000)refreshAll();},60000);
if('serviceWorker' in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
refreshAll();
