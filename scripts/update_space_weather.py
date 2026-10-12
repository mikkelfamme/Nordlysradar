#!/usr/bin/env python3
"""NOAA -> validated, compact GitHub Pages feed with 90-day observed storm history.
Usage: python3 scripts/update_space_weather.py   (Python stdlib, no API key)
NOAA JSON schema may change; validation intentionally fails rather than committing fake zeros.
"""
import json
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import urlopen, Request

ROOT=Path(__file__).resolve().parents[1]
BASE='https://services.swpc.noaa.gov'

def fetch_json(path):
    req=Request(BASE+path,headers={'User-Agent':'Nordlysradar/1.0 (personal-educational-app)'})
    with urlopen(req,timeout=25) as response:
        return json.load(response)

def parse_time(s):
    timestamp=datetime.fromisoformat(str(s).replace(' ','T').replace('Z','+00:00'))
    return timestamp if timestamp.tzinfo is not None else timestamp.replace(tzinfo=timezone.utc)

def normalize_kp(raw):
    out=[]
    for r in raw:
        if r.get('time_tag') is None: continue
        kp=r.get('kp')
        if kp is None or not isinstance(kp,(int,float)) or not math.isfinite(kp):continue
        out.append({'time':r['time_tag'],'kp':round(kp,2),
                    'kind':r.get('observed','observed'),'g':r.get('noaa_scale')})
    return out

def compact_aurora(raw):
    data=raw.get('coordinates',[])
    if not isinstance(data,list):raise ValueError('NOAA OVATION coordinates not list')
    points=[]
    for row in data:
        if not isinstance(row,list) or len(row)<3:continue
        lon,lat,power=row[:3]
        if not all(isinstance(x,(int,float)) for x in (lon,lat,power)):continue
        if 38<=lat<=90 and power>=2 and int(lon)%2==0 and int(lat)%2==0:
            points.append([int(lon),int(lat),round(power,1)])
    return {'forecast_time':raw.get('Forecast Time'),
            'observation_time':raw.get('Observation Time'),'points':points}

def latest_active(rows):
    if not isinstance(rows,list):return {}
    active=[r for r in rows if isinstance(r,dict) and r.get('active') is not False and r.get('time_tag')]
    return max(active,key=lambda r:r['time_tag']) if active else {}

def solar_wind():
    # Missing solar wind never invalidates Kp and OVATION feeds.
    try:
        mag=latest_active(fetch_json('/json/rtsw/rtsw_mag_1m.json'))
        wind=latest_active(fetch_json('/json/rtsw/rtsw_wind_1m.json'))
        return {'time':mag.get('time_tag') or wind.get('time_tag'),
                'bz':mag.get('bz_gsm'),'speed':wind.get('proton_speed'),
                'density':wind.get('proton_density')}
    except Exception as exc:
        print('Solar wind unavailable:',exc)
        return {'time':None,'bz':None,'speed':None,'density':None}

def alerts():
    try:
        raw=fetch_json('/products/alerts.json')
        return [{'id':v.get('product_id'),'time':v.get('issue_datetime'),
                 'message':(v.get('message') or '')[:550]}
                for v in raw if str(v.get('product_id','')).startswith(('A','K'))][:25]
    except Exception as exc:
        print('Alerts unavailable:',exc)
        return []

def history_update(observed):
    path=ROOT/'data/history.json'
    try:old=json.loads(path.read_text())
    except (OSError,ValueError):old={}
    cutoff=datetime.now(timezone.utc)-timedelta(days=90)
    combined={}
    for item in old.get('kp_samples',[]) + observed:
        if not item.get('time') or item.get('kp') is None:continue
        try:date=parse_time(item['time'])
        except ValueError:continue
        if date>=cutoff:
            combined[date.isoformat()]={'time':item['time'],'kp':item['kp'],'g':item.get('g')}
    samples=[combined[k] for k in sorted(combined)]
    # Keep history identical unless NOAA has new/revised observations or old ones expire.
    # Avoid an unnecessary commit every 30 minutes solely due to updated_at.
    changed = samples != old.get('kp_samples',[]) or not old.get('updated_at')
    updated_at = datetime.now(timezone.utc).isoformat() if changed else old['updated_at']
    if changed:
        path.write_text(json.dumps({'schema_version':1,'updated_at':updated_at,
                                    'kp_samples':samples},ensure_ascii=False,separators=(',',':'))+'\n')
    print('History samples:',len(samples),'changed:',changed)

def main():
    kp=normalize_kp(fetch_json('/products/noaa-planetary-k-index-forecast.json'))
    if len(kp)<10 or not any(r['kind']=='predicted' for r in kp):
        raise ValueError('NOAA returned no valid forecast; refusing to overwrite current data')
    raw_aurora=fetch_json('/json/ovation_aurora_latest.json')
    if not raw_aurora.get('Forecast Time') or len(raw_aurora.get('coordinates',[]))<10000:
        raise ValueError('NOAA OVATION grid incomplete; refusing to overwrite current data')
    aurora=compact_aurora(raw_aurora)
    now=datetime.now(timezone.utc)
    data={'schema_version':1,'status':'ok','updated_at':now.isoformat(),
          'kp':kp,'aurora':aurora,'solar_wind':solar_wind(),'alerts':alerts()}
    (ROOT/'data/space-weather.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    history_update([{'time':r['time'],'kp':r['kp'],'g':r['g']} for r in kp if r['kind']=='observed'])
    print('Updated',now.isoformat(),'Kp rows',len(kp),'aurora points',len(aurora['points']))

if __name__=='__main__':main()
