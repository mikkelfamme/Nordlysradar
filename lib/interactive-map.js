/**
 * Self-contained interactive Web Mercator map (pan, pinch, zoom, inspect).
 * Only tiles currently requested by the user's actual visible viewport load.
 * © OpenStreetMap contributors: https://www.openstreetmap.org/copyright
 * Basemap: https://tile.openstreetmap.org/{z}/{x}/{y}.png
 * NOAA OVATION intensity is NOT a local aurora probability percentage.
 */
import {kmDistance,utc} from './scoring.js';

const TILE=256,MIN_Z=2,MAX_Z=7.6,MAX_LAT=85.05112878;
const imgCache=new Map();
const limit=(n,a,b)=>Math.max(a,Math.min(b,n));
const mapRad=Math.PI/180;
const normLon=lon=>((lon+180)%360+360)%360-180;
export function mercator(lon,lat,zoom){
  const size=TILE*2**zoom;lat=limit(lat,-MAX_LAT,MAX_LAT);
  return {x:((normLon(lon)+180)/360)*size,y:(.5-Math.log((1+Math.sin(lat*mapRad))/(1-Math.sin(lat*mapRad)))/(4*Math.PI))*size};
}
export function inverseMercator(x,y,zoom){
  const size=TILE*2**zoom;
  return {lon:normLon(x/size*360-180),lat:180/Math.PI*Math.atan(Math.sinh(Math.PI*(1-2*y/size)))};
}
export function nearbyAurora(points,lat,lon,maxKm=450){
  let best=null;
  for(const p of points||[]){
    if(!Array.isArray(p)||p.length<3||p[2]<2)continue;
    const d=kmDistance(lat,lon,p[1],normLon(p[0]));
    if(d<maxKm&&(!best||d<best.distance))best={power:p[2],distance:d,lat:p[1],lon:normLon(p[0])};
  }
  return best;
}
function tileImage(z,x,y,draw){
  const n=2**z;
  if(y<0||y>=n)return null;
  x=((x%n)+n)%n;
  const key=`${z}/${x}/${y}`;
  if(imgCache.has(key)){
    const cached=imgCache.get(key);imgCache.delete(key);imgCache.set(key,cached);
    return cached;
  }
  const image=new Image();
  const entry={image,loaded:false,failed:false};
  imgCache.set(key,entry);
  image.onload=()=>{entry.loaded=true;draw();};
  image.onerror=()=>{entry.failed=true;draw();};
  image.src=`https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  while(imgCache.size>160)imgCache.delete(imgCache.keys().next().value);
  return entry;
}
function powerColor(p){
  if(p>=65)return [251,130,172];
  if(p>=38)return [209,231,121];
  if(p>=18)return [87,240,157];
  return [37,195,171];
}
export function initAuroraMap(canvas,aurora,location,options={}){
  if(!canvas)return null;
  const parent=canvas.closest('.live-map-card');
  const details=parent?.querySelector('#map-point-info');
  const pointers=new Map();
  const c=options.camera||{};
  const state={lat:Number.isFinite(c.lat)?limit(c.lat,-76,83):limit(location.lat+5,-72,80),lon:Number.isFinite(c.lon)?normLon(c.lon):location.lon,zoom:Number.isFinite(c.zoom)?limit(c.zoom,MIN_Z,MAX_Z):3.5,overlay:options.overlay!==false,pick:null,dragged:false};
  const reportCamera=()=>options.onCameraChange?.({lat:state.lat,lon:state.lon,zoom:state.zoom});
  const fresh=!!(utc(aurora?.forecast_time)?.getTime() && Math.abs(Date.now()-utc(aurora.forecast_time).getTime())<2*3600000);
  const points=fresh&&Array.isArray(aurora?.points)?aurora.points:[];
  let raf=0,previousDrag=null,prevPinch=null,totalMovement=0;
  function dimensions(){
    const r=canvas.getBoundingClientRect();return {w:Math.max(250,Math.round(r.width)),h:Math.max(250,Math.round(r.height))};
  }
  function project(lat,lon,w,h){
    const size=TILE*2**state.zoom,p=mercator(lon,lat,state.zoom),c=mercator(state.lon,state.lat,state.zoom);
    let dx=p.x-c.x;if(dx>size/2)dx-=size;if(dx< -size/2)dx+=size;
    return {x:w/2+dx,y:h/2+p.y-c.y};
  }
  function unproject(x,y,w,h){const c=mercator(state.lon,state.lat,state.zoom);return inverseMercator(c.x+(x-w/2),c.y+(y-h/2),state.zoom);}
  function moveBy(dx,dy){const c=mercator(state.lon,state.lat,state.zoom);const next=inverseMercator(c.x-dx,c.y-dy,state.zoom);state.lat=limit(next.lat,-76,83);state.lon=next.lon;reportCamera();requestDraw();}
  function zoomBy(d){state.zoom=limit(state.zoom+d,MIN_Z,MAX_Z);reportCamera();requestDraw();}
  function draw(){
    raf=0;if(!canvas.isConnected)return;
    const {w,h}=dimensions(),dpr=Math.min(2,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#0f3440');bg.addColorStop(1,'#0b2633');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    const iz=Math.floor(state.zoom),scale=2**(state.zoom-iz);
    const origin=mercator(state.lon,state.lat,iz);
    const worldPx=TILE*2**iz;
    const left=origin.x-(w/2)/scale,top=origin.y-(h/2)/scale;
    const ix0=Math.floor(left/TILE)-1,iy0=Math.floor(top/TILE)-1;
    const ix1=Math.ceil((left+w/scale)/TILE)+1,iy1=Math.ceil((top+h/scale)/TILE)+1;
    for(let yi=iy0;yi<=iy1;yi++) for(let xi=ix0;xi<=ix1;xi++) {
      const x=(xi*TILE-left)*scale,y=(yi*TILE-top)*scale,sz=TILE*scale;
      const entry=tileImage(iz,xi,yi,requestDraw);
      if(entry?.loaded)ctx.drawImage(entry.image,x,y,sz+.5,sz+.5);
    }
    // Subtle night-time shading makes model energy legible over OSM tiles.
    ctx.fillStyle='rgba(2,18,30,.26)';ctx.fillRect(0,0,w,h);
    if(state.overlay){
      ctx.save();ctx.globalCompositeOperation='screen';
      const radius=limit(TILE*2**state.zoom/360*1.8,5,35);
      for(const [lon,lat,power] of points){
        if(power<2)continue;
        const pt=project(lat,lon,w,h);
        if(pt.x<-radius||pt.x>w+radius||pt.y<-radius||pt.y>h+radius)continue;
        const c=powerColor(power),alpha=limit(.18+Number(power)/135,.2,.82);
        ctx.fillStyle=`rgba(${c.join(',')},${alpha.toFixed(2)})`;
        ctx.beginPath();ctx.arc(pt.x,pt.y,radius,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
    // The user's location is always drawn above the aurora overlay.
    const here=project(location.lat,location.lon,w,h);
    if(here.x>-12&&here.x<w+12&&here.y>-12&&here.y<h+12){
      const halo=ctx.createRadialGradient(here.x,here.y,1,here.x,here.y,25);
      halo.addColorStop(0,'rgba(174,248,233,.4)');halo.addColorStop(1,'rgba(174,248,233,0)');
      ctx.fillStyle=halo;ctx.beginPath();ctx.arc(here.x,here.y,25,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#eafff2';ctx.strokeStyle='#073843';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(here.x,here.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.font='bold 12px system-ui';ctx.textAlign='left';ctx.fillStyle='#fff';ctx.shadowColor='#021622';ctx.shadowBlur=6;
      ctx.fillText('DIN LOKATION',limit(here.x+12,6,w-100),here.y-11);ctx.shadowBlur=0;
    }
    if(state.pick){
      const p=project(state.pick.lat,state.pick.lon,w,h);
      ctx.lineWidth=2;ctx.strokeStyle='#fff9c3';ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(p.x-14,p.y);ctx.lineTo(p.x+14,p.y);ctx.moveTo(p.x,p.y-14);ctx.lineTo(p.x,p.y+14);ctx.stroke();
    }
  }
  function requestDraw(){if(!raf)raf=requestAnimationFrame(draw);}
  function inspect(x,y){
    const {w,h}=dimensions(),q=unproject(x,y,w,h);state.pick=q;
    const nearest=nearbyAurora(points,q.lat,q.lon);
    if(details){
      const geo=`${Math.abs(q.lat).toFixed(1)}° ${q.lat>=0?'N':'S'}, ${Math.abs(q.lon).toFixed(1)}° ${q.lon>=0?'Ø':'V'}`;
      if(!fresh)details.textContent=`${geo} · NOAA-prognosen mangler eller er forældet. Ingen aktivitet kan vurderes.`;
      else if(nearest)details.textContent=`${geo} · Modelleret NOAA-intensitet ${Number(nearest.power).toFixed(0)} (ikke en sandsynlighed) · Nærmeste modelpunkt ${Math.round(nearest.distance)} km væk.`;
      else details.textContent=`${geo} · Ingen markant modelleret nordlysaktivitet inden for 450 km af punktet.`;
    }
    requestDraw();
  }
  canvas.addEventListener('pointerdown',e=>{
    canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    state.dragged=false;totalMovement=0;
    if(pointers.size===1)previousDrag={x:e.clientX,y:e.clientY};
    if(pointers.size===2){const values=[...pointers.values()];prevPinch=Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);}
  });
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){const v=[...pointers.values()],distance=Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y);
      if(prevPinch){const delta=Math.log2(distance/prevPinch);if(Number.isFinite(delta)&&Math.abs(delta)>.025){zoomBy(delta);state.dragged=true;}}
      prevPinch=distance;
    }else if(previousDrag){
      const dx=e.clientX-previousDrag.x,dy=e.clientY-previousDrag.y;
      if(Math.abs(dx)+Math.abs(dy)>1){moveBy(dx,dy);totalMovement+=Math.hypot(dx,dy);if(totalMovement>5)state.dragged=true;}
      previousDrag={x:e.clientX,y:e.clientY};
    }
  });
  canvas.addEventListener('pointerup',e=>{
    const wasDragging=state.dragged;
    pointers.delete(e.pointerId);previousDrag=null;prevPinch=null;
    if(!wasDragging&&pointers.size===0){const r=canvas.getBoundingClientRect();inspect(e.clientX-r.left,e.clientY-r.top);}
    if(pointers.size===0)state.dragged=false;
  });
  canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);previousDrag=null;prevPinch=null;state.dragged=false;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoomBy(e.deltaY<0?.30:-.30);},{passive:false});
  canvas.addEventListener('keydown',e=>{
    if(e.key==='+'||e.key==='=')zoomBy(.6);
    else if(e.key==='-')zoomBy(-.6);
    else if(e.key==='ArrowUp')moveBy(0,70);
    else if(e.key==='ArrowDown')moveBy(0,-70);
    else if(e.key==='ArrowLeft')moveBy(70,0);
    else if(e.key==='ArrowRight')moveBy(-70,0);
    else return;
    e.preventDefault();
  });
  parent?.querySelector('[data-map-zoom="in"]')?.addEventListener('click',()=>zoomBy(.8));
  parent?.querySelector('[data-map-zoom="out"]')?.addEventListener('click',()=>zoomBy(-.8));
  parent?.querySelector('[data-map-reset]')?.addEventListener('click',()=>{state.lat=limit(location.lat+5,-72,80);state.lon=location.lon;state.zoom=3.5;state.pick=null;reportCamera();requestDraw();});
  parent?.querySelector('[data-map-overlay]')?.addEventListener('change',e=>{state.overlay=e.target.checked;options.onOverlayChange?.(state.overlay);requestDraw();});
  if(typeof ResizeObserver!=='undefined'){
    const ro=new ResizeObserver(()=>{if(canvas.isConnected)requestDraw();else ro.disconnect();});ro.observe(canvas);
  }
  requestDraw();
  return {zoomIn:()=>zoomBy(.8),zoomOut:()=>zoomBy(-.8),inspect,redraw:requestDraw};
}
