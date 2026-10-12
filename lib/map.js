/** Polar overview of OVATION auroral-oval grid (not a political/geographic basemap). */
export function drawMap(canvas, aurora, location) {
  if(!canvas || !location) return;
  const rect=canvas.getBoundingClientRect();
  const w=Math.max(250,Math.floor(rect.width)),h=Math.max(250,Math.floor(rect.height));
  const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=w*dpr;canvas.height=h*dpr;
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const cx=w/2,cy=h/2, r=Math.min(w,h)*.425;
  const point=(lat,lon)=>{const rad=Math.PI/180, a=(90-lat)/53*r;
    return {x:cx+a*Math.sin(lon*rad),y:cy-a*Math.cos(lon*rad)};};
  const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,r*1.08);
  glow.addColorStop(0,'#123748');glow.addColorStop(.68,'#0a2034');glow.addColorStop(1,'#071927');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
  // Latitude rings and longitude lines
  for(const lat of [40,50,60,70,80]) {const a=(90-lat)/53*r;ctx.strokeStyle='rgba(143,198,209,.14)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,a,0,Math.PI*2);ctx.stroke();}
  for(let lon=0;lon<360;lon+=30){const p=point(38,lon);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.strokeStyle='rgba(143,198,209,.08)';ctx.stroke();}
  if(aurora?.points?.length){
    ctx.globalCompositeOperation='screen';
    for(const [lon,lat,power] of aurora.points) {
      if(lat<38) continue;
      const p=point(lat,lon);
      const intensity=Math.min(1,power/38);
      const bright=power>28;
      ctx.fillStyle=bright?`rgba(151,248,173,${.10+.62*intensity})`:`rgba(39,207,142,${.11+.52*intensity})`;
      ctx.beginPath();ctx.arc(p.x,p.y,2.2+intensity*2.4,0,Math.PI*2);ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';
  }
  ctx.restore();
  ctx.strokeStyle='rgba(157,220,220,.28)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
  ctx.font='11px system-ui, sans-serif';ctx.textAlign='center';
  ctx.fillStyle='rgba(188,221,224,.5)';
  for(const lat of [50,60,70,80]) {const rr=(90-lat)/53*r;ctx.fillText(lat+'°N',cx,cy-rr+14);}
  const az=[['0°',0],['90°',90],['180°',180],['270°',270]];
  for(const [label,lon] of az) {const p=point(38,lon);const dx=(p.x-cx)*1.12,dy=(p.y-cy)*1.12;ctx.fillStyle='#8baab7';ctx.fillText(label,cx+dx,cy+dy+4);}
  if(location.lat>=38){
    const here=point(location.lat,location.lon);
    const halo=ctx.createRadialGradient(here.x,here.y,1,here.x,here.y,20);
    halo.addColorStop(0,'rgba(255,255,255,.30)');halo.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(here.x,here.y,20,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#e4fffe';ctx.beginPath();ctx.arc(here.x,here.y,4.1,0,Math.PI*2);ctx.fill();
    ctx.lineWidth=1.8;ctx.strokeStyle='#042024';ctx.stroke();
    ctx.fillStyle='#e4fffe';ctx.font='bold 11px system-ui';ctx.textAlign=here.x>cx+50?'right':'left';
    ctx.fillText('DIG',here.x+(here.x>cx+50?-11:11),here.y-9);
  }
  ctx.fillStyle='#cbe6e5';ctx.textAlign='center';ctx.font='11px system-ui';ctx.fillText('NORDPOLEN',cx,cy+3);
}
