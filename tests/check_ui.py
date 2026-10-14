#!/usr/bin/env python3
"""Fully offline Playwright smoke tests. Injects a single-script TEST bundle into about:blank
because the QA environment's managed Chromium URLBlocklist prevents localhost navigation.
Production app is unbundled ES modules, and TEST data is NOT shipped in live app.
"""
from datetime import datetime, timezone, timedelta
from pathlib import Path
import json, re, base64
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
NOW=datetime.now(timezone.utc)
FLOOR=NOW.replace(minute=0,second=0,microsecond=0)

def iso(t):return t.strftime('%Y-%m-%dT%H:%M:%S')

def fake_space():
    from math import sin,pi
    base=NOW.replace(hour=(NOW.hour//3)*3,minute=0,second=0,microsecond=0)-timedelta(days=4)
    kp=[]
    for i in range(58):
        t=base+timedelta(hours=i*3)
        val=round(6.1+1.2*sin(i*.65),2)
        kp.append(dict(time=iso(t),kp=val,kind='predicted' if t>NOW else 'observed',g='G2' if val>=6 else 'G1'))
    points=[]
    for lon in range(0,360,4):
        for lat in range(58,75,2):points.append([lon,lat,round(14+14*abs(sin((lon+lat)*pi/180)),1)])
    return dict(schema_version=1,status='ok',updated_at=NOW.isoformat(),kp=kp,
        aurora={'forecast_time':(NOW+timedelta(minutes=30)).isoformat(),'observation_time':NOW.isoformat(),'points':points},
        solar_wind={'time':NOW.isoformat(),'bz':-12.4,'speed':689,'density':9.2},
        alerts=[{'id':'A20F','time':iso(NOW-timedelta(hours=1)),
                 'message':'WATCH: Geomagnetic Storm Category G2 Predicted\nFor tonight'}])

def fake_weather():
    values=[int((FLOOR+timedelta(hours=i)).timestamp()) for i in range(-24,96)]
    cloud=[15+(i*7)%19 for i in range(len(values))]
    return dict(timezone='Europe/Copenhagen',hourly=dict(time=values,cloud_cover=cloud,
        cloud_cover_low=[max(0,v-7) for v in cloud],cloud_cover_mid=[5]*len(values),
        cloud_cover_high=[8]*len(values),visibility=[20000]*len(values),precipitation_probability=[0]*len(values)))

def build_html():
    modules=['lib/astro.js','lib/scoring.js','lib/data.js','lib/storage.js','lib/map.js','lib/interactive-map.js','lib/alerts.js','app.js']
    bundle='\n'.join(re.sub(r'^import\s+.+?;\s*$', '', re.sub(r'\bexport\s+(?=(?:async\s+function|const|let|function|class)\b)', '', (ROOT/m).read_text()),flags=re.M) for m in modules)
    icon_uri='data:image/svg+xml;base64,'+base64.b64encode((ROOT/'assets/aurora-icon.svg').read_bytes()).decode()
    bundle=bundle.replace('./assets/aurora-icon.svg',icon_uri)
    fake_api={
        'space':fake_space(), 'history':{'kp_samples':fake_space()['kp']},
        'weather':fake_weather(), 'geocode':{'results':[{'name':'Hornbæk','admin1':'Region Hovedstaden',
           'country':'Danmark','latitude':56.091,'longitude':12.46}]}
    }
    fake_js='''
      const _saved = {};
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem(k){return Object.hasOwn(_saved,k)?_saved[k]:null;},
        setItem(k,v){_saved[k]=String(v);},removeItem(k){delete _saved[k];},
        clear(){for(const k of Object.keys(_saved))delete _saved[k];}
      }});
      window.confirm = ()=>true;
      window.fetch=async (url)=>{
        const p=String(url);
        let data=null;
        if(p.includes('data/space-weather.json'))data=window.__fake.space;
        else if(p.includes('data/history.json'))data=window.__fake.history;
        else if(p.includes('geocoding-api.open-meteo.com'))data=window.__fake.geocode;
        else if(p.includes('api.open-meteo.com'))data=window.__fake.weather;
        if(data===null)throw new Error('Test fixture URL not mocked: '+p);
        return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
      };
    '''
    html=(ROOT/'index.html').read_text()
    html=html.replace('<link rel="stylesheet" href="./styles.css">','<style>'+(ROOT/'styles.css').read_text()+'</style>')
    html=html.replace('<script type="module" src="./app.js"></script>',
                     '<script>window.__fake='+json.dumps(fake_api)+';'+fake_js+'</script><script>'+bundle+'</script>')
    return html

def run():
  html=build_html()
  with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for name,wide,height in [('mobile',390,844),('desktop',1500,960)]:
      ctx=browser.new_context(viewport={'width':wide,'height':height},device_scale_factor=1,accept_downloads=True)
      ctx.route('**/tile.openstreetmap.org/**',lambda route:route.abort())
      page=ctx.new_page(); errors=[]
      page.on('pageerror',lambda e:errors.append(str(e)))
      page.set_content(html,wait_until='domcontentloaded')
      page.wait_for_function("document.querySelector('.gauge-center strong') && document.querySelector('.gauge-center strong').textContent !== '—'",timeout=15000)
      page.screenshot(path=str(ROOT/f'tests/preview-{name}.png'),full_page=(name=='mobile'),timeout=12000)
      print(name,'score',page.locator('.gauge-center strong').inner_text(),'title',page.title())
      assert page.locator('.metric').count()==4
      nav='.mobile-nav' if name=='mobile' else '.side-nav'
      page.locator(f'{nav} [data-tab="forecast"]').click()
      assert 'Nordlysprognose' in page.inner_text('#main-content')
      page.locator('[data-hour]').nth(5).click()
      assert 'VALGT TIME' in page.inner_text('#main-content')
      page.locator(f'{nav} [data-tab="sky"]').click()
      assert 'Måne & mørke' in page.inner_text('#main-content')
      page.locator(f'{nav} [data-tab="storms"]').click()
      assert 'Interaktivt nordlyskort' in page.inner_text('#main-content')
      assert page.locator('#interactiveAuroraMap').count()==1
      page.locator('[data-map-zoom="in"]').click()
      page.locator('#interactiveAuroraMap').click(position={'x':120,'y':140})
      assert 'NOAA' in page.locator('#map-point-info').inner_text() or 'modelleret' in page.locator('#map-point-info').inner_text()
      page.screenshot(path=str(ROOT/f'tests/storms-{name}.png'),full_page=(name=='mobile'),timeout=12000)
      page.locator(f'{nav} [data-tab="places"]').click()
      page.fill('#locationQuery','Hornbæk')
      page.locator('#placeSearchForm button[type=submit]').click()
      page.wait_for_selector('[data-pick-result]')
      page.locator('[data-pick-result]').first.click()
      assert 'Hornbæk' in page.locator('.location-button').inner_text()
      page.locator(f'{nav} [data-tab="settings"]').click()
      page.locator('label.choice-tile:has(input[value="camera"])').click()
      assert page.locator('[data-generate-topic]').count()==1
      page.locator('[data-generate-topic]').click()
      assert page.locator('[data-copy-config]').count()==1
      assert page.locator('[data-copy-widget-parameter]').count()==1
      assert page.locator('input[name=mode][value=camera]').is_checked()
      page.locator('[data-open-log]').first.click()
      page.fill('#logNote','Grønt nordlys mod nord i en test.')
      page.evaluate('document.querySelector("#logForm button[type=submit]").click()')
      assert 'Grønt nordlys' in page.inner_text('#main-content')
      page.locator('[data-export]').click()
      assert page.locator('.observation-item').count() == 1
      assert not errors, str(errors)
      print(name,'navigation, forecast, moon, map, location, journal, settings passed')
      ctx.close()
    browser.close()

if __name__=='__main__':run()
