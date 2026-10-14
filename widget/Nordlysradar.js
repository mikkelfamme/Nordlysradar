// NORDLYSRADAR · iPhone-widget til Scriptable
// 1. Installer Scriptable fra App Store.
// 2. Importér denne fil som nyt script med navnet "Nordlysradar".
// 3. Tilføj en Scriptable-widget på hjemmeskærmen og vælg scriptet.
// 4. Sæt widget-parameter til "55.6761,12.5683,København" eller kopier din fra appen.
//    Parameter: breddegrad,længdegrad,stednavn,lysforurening,metode
// Eksempel: 55.6761,12.5683,København,city,eye
// Widget opdateres efter iOS' egen tidsplan; 30 min er kun tidligst ønskede tid.
// Skift APP_URL hvis du udgiver fra et andet GitHub Pages-repository.
const APP_URL = 'https://mikkelfamme.github.io/nordlysradar/';
const DEFAULT_PARAMETER='55.6761,12.5683,København,city,eye';
const PARAM=(args.widgetParameter||DEFAULT_PARAMETER).split(',');
const LAT=Number(PARAM[0]), LON=Number(PARAM[1]);
const PLACE=(PARAM[2]||'Min lokation').trim().slice(0,40);
const LIGHT=['city','suburb','dark'].includes(PARAM[3])?PARAM[3]:'city';
const MODE=PARAM[4]==='camera'?'camera':'eye';
const WIDGET_FAMILY=config.widgetFamily||'medium';
const DEG=Math.PI/180;

function parseUTC(s){if(!s)return null;const str=String(s).replace(' ','T');return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(str)?str:str+'Z');}
async function json(url){const r=new Request(url);r.timeoutInterval=12;return await r.loadJSON();}
const validLocation=Number.isFinite(LAT)&&Number.isFinite(LON)&&Math.abs(LAT)<=90&&Math.abs(LON)<=180;

// Samme sol- og måneapproximation som webappen / SunCalc.
function skyAt(date,lat,lon){
  const d=date.getTime()/86400000-.5+2440588-2451545, E=DEG*23.4397;
  const ra=(l,b)=>Math.atan2(Math.sin(l)*Math.cos(E)-Math.tan(b)*Math.sin(E),Math.cos(l));
  const dec=(l,b)=>Math.asin(Math.sin(b)*Math.cos(E)+Math.cos(b)*Math.sin(E)*Math.sin(l));
  const M=DEG*(357.5291+.98560028*d), C=DEG*(1.9148*Math.sin(M)+.02*Math.sin(2*M)+.0003*Math.sin(3*M));
  const L=M+C+DEG*102.9372+Math.PI;
  const sun={ra:ra(L,0),dec:dec(L,0)};
  const mL=DEG*(218.316+13.176396*d),mM=DEG*(134.963+13.064993*d),mF=DEG*(93.272+13.229350*d);
  const ml=mL+DEG*6.289*Math.sin(mM), mb=DEG*5.128*Math.sin(mF);
  const moon={ra:ra(ml,mb),dec:dec(ml,mb)},dist=385001-20905*Math.cos(mM);
  const phi=Math.acos(Math.max(-1,Math.min(1,Math.sin(sun.dec)*Math.sin(moon.dec)+Math.cos(sun.dec)*Math.cos(moon.dec)*Math.cos(sun.ra-moon.ra))));
  const inc=Math.atan2(149598000*Math.sin(phi),dist-149598000*Math.cos(phi));
  const altitude=obj=>Math.asin(Math.sin(lat*DEG)*Math.sin(obj.dec)+Math.cos(lat*DEG)*Math.cos(obj.dec)*Math.cos(DEG*(280.16+360.9856235*d+lon)-obj.ra))/DEG;
  return {sunAlt:altitude(sun),moonAlt:altitude(moon),moonFraction:Math.max(0,Math.min(1,(1+Math.cos(inc))/2))};
}
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
function kpAt(rows,now){
  if(!Array.isArray(rows))return null;
  const t=now.getTime();
  for(const r of [...rows].reverse()){const start=parseUTC(r.time)?.getTime();if(Number.isFinite(start)&&Number.isFinite(Number(r.kp))&&t>=start&&t<start+3*3600000+60000)return Number(r.kp);}
  return null;
}
function haversine(a,b,c,d){const dl=(c-a)*DEG,ds=(d-b)*DEG;const k=Math.sin(dl/2)**2+Math.cos(a*DEG)*Math.cos(c*DEG)*Math.sin(ds/2)**2;return 6371*2*Math.atan2(Math.sqrt(k),Math.sqrt(Math.max(0,1-k)));}
function auroraSignal(aurora,now){
  const t=parseUTC(aurora?.forecast_time)?.getTime();
  if(!t||Math.abs(now.getTime()-t)>2*3600000||!Array.isArray(aurora.points))return null;
  let best=0;
  for(const [lon,lat,intensity] of aurora.points){if(intensity<3||lat<LAT-10)continue;const ds=haversine(LAT,LON,lat,lon);if(ds>1250)continue;best=Math.max(best,Math.pow(Math.max(0,1-ds/1250),1.05)*Math.min(1,intensity/32));}
  return Math.round(best*100);
}
function calc(kp,sky,cloud,vis,oval){
  if(kp===null||cloud===null)return null;
  const threshold=clamp(6.1-(LAT-55.5)*.26,1.8,9.2);
  const kpScore=clamp(100/(1+Math.exp(-(kp-threshold)*1.03)));
  const activity=oval===null?kpScore:.64*kpScore+.36*oval;
  const darkness=sky.sunAlt>=-4?0:sky.sunAlt<=-18?1:clamp((-sky.sunAlt-4)/14,0,1);
  const clouds=clamp(1-.96*(cloud/100)**1.3,0,1);
  const moon=sky.moonAlt<=0?1:1-Math.min(.52,sky.moonFraction**.73*(.18+.34*Math.sin(Math.min(90,sky.moonAlt)*DEG)));
  const fog=vis!==null&&vis<5000?clamp(.5+vis/10000,.5,1):1;
  return Math.round(clamp(activity*darkness*clouds*moon*({city:.72,suburb:.87,dark:1}[LIGHT]||.87)*fog*(MODE==='camera'?1.17:1)));
}
async function getData(){
  if(!validLocation)throw new Error('Ugyldig lokation');
  const params=`latitude=${LAT}&longitude=${LON}&hourly=cloud_cover,visibility&forecast_days=1&past_days=1&timezone=auto&timeformat=unixtime`;
  const [space,weather]=await Promise.all([json(APP_URL.replace(/\/?$/,'/')+'data/space-weather.json'),json('https://api.open-meteo.com/v1/forecast?'+params)]);
  const now=new Date();
  if(!space?.updated_at||Date.now()-parseUTC(space.updated_at).getTime()>4*3600000)throw new Error('NOAA-data er forældede');
  const kp=kpAt(space.kp,now), sky=skyAt(now,LAT,LON);
  let idx=-1,dist=Infinity;
  for(let i=0;i<(weather.hourly?.time||[]).length;i++){const delta=Math.abs(weather.hourly.time[i]*1000-now.getTime());if(delta<dist){idx=i;dist=delta;}}
  if(dist>55*60000)throw new Error('Mangler lokale skyer');
  const raw=weather.hourly.cloud_cover?.[idx],cloud=raw==null?null:Number(raw);
  const visRaw=weather.hourly.visibility?.[idx];
  const visibility=visRaw==null?null:Number(visRaw);
  const score=calc(kp,sky,Number.isFinite(cloud)?cloud:null,visibility,auroraSignal(space.aurora,now));
  return {kp,cloud,moon:Math.round(sky.moonFraction*100),score,updated:parseUTC(space.updated_at),night:sky.sunAlt<-10};
}
function label(score){if(score==null)return 'Mangler målinger';if(score>=80)return 'Meget gode forhold';if(score>=60)return 'Gode forhold';if(score>=35)return 'Hold øje';if(score>=17)return 'Begrænset mulighed';return 'Lav mulighed';}
function addText(stack,s,size,color,bold=false){const t=stack.addText(s);t.font=bold?Font.boldSystemFont(size):Font.systemFont(size);t.textColor=new Color(color);t.lineLimit=1;return t;}
function badge(stack,labelText,value){const block=stack.addStack();block.layoutVertically();block.spacing=3;addText(block,labelText,9,'#9bb6c0');addText(block,value,12,'#e9fff6',true);}
const widget=new ListWidget();
const gradient=new LinearGradient();gradient.colors=[new Color('#071a2a'),new Color('#103c3a')];gradient.locations=[0,1];widget.backgroundGradient=gradient;
widget.setPadding(13,14,13,14);widget.url=APP_URL;
widget.refreshAfterDate=new Date(Date.now()+30*60000);
try{
  const d=await getData();
  const row=widget.addStack();row.centerAlignContent();addText(row,'✦ NORDLYSRADAR',10,'#9bf4c7',true);row.addSpacer();
  addText(row,PLACE,10,'#b5d4d9');
  widget.addSpacer(6);
  if(WIDGET_FAMILY==='accessoryRectangular'||WIDGET_FAMILY==='accessoryInline'){
    addText(widget,`${d.score===null?'—':d.score+'/100'}  ·  Kp ${d.kp===null?'—':d.kp.toFixed(1)} · ${label(d.score)}`,13,'#ffffff',true);
  }else{
    const content=widget.addStack();content.centerAlignContent();
    const left=content.addStack();left.layoutVertically();left.spacing=3;
    addText(left,d.score===null?'—':String(d.score),WIDGET_FAMILY==='small'?43:50,'#eafff1',true);
    addText(left,'OBSERVATIONSINDEKS',8,'#89b8bb',true);
    if(WIDGET_FAMILY==='medium'||WIDGET_FAMILY==='large'){
      content.addSpacer(16);const right=content.addStack();right.layoutVertically();right.spacing=7;
      addText(right,label(d.score),15,'#ccffe3',true);
      addText(right,d.night?'Mørkt på stedet':'Det er endnu lyst',10,'#a8c4c9');
    }
  }
  widget.addSpacer(10);
  const stats=widget.addStack();stats.layoutHorizontally();
  badge(stats,'Kp',d.kp===null?'—':d.kp.toFixed(1));stats.addSpacer();
  badge(stats,'Skyer',d.cloud===null?'—':Math.round(d.cloud)+' %');stats.addSpacer();
  badge(stats,'Måne',d.moon+' %');
  widget.addSpacer(7);
  addText(widget,'Opdatering følger iOS · NOAA + Open-Meteo',8,'#83aab4');
}catch(e){
  addText(widget,'✦ NORDLYSRADAR',11,'#9bf4c7',true);widget.addSpacer(15);
  addText(widget,'Afventer friske data',17,'#eafff1',true);
  widget.addSpacer(6);addText(widget,'Åbn appen eller prøv igen senere',10,'#bad6d7');
}
if(config.runsInWidget)Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
