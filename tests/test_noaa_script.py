"""Offline validation of NOAA normalizers and history retention."""
import unittest, importlib.util, tempfile, json
from datetime import datetime, timezone
from unittest.mock import patch
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'scripts/update_space_weather.py'
spec=importlib.util.spec_from_file_location('space',p)
space=importlib.util.module_from_spec(spec);spec.loader.exec_module(space)
class FeedTest(unittest.TestCase):
 def test_kp_schema(self):
  d=space.normalize_kp([{'time_tag':'2026-10-12T00:00:00','kp':7.00,'observed':'observed','noaa_scale':'G3'},
                        {'time_tag':'2026-10-12T03:00:00','kp':5.0,'observed':'predicted','noaa_scale':'G1'}])
  self.assertEqual(len(d),2);self.assertEqual(d[0]['g'],'G3');self.assertEqual(d[1]['kind'],'predicted')
 def test_aurora_sampling(self):
  d=space.compact_aurora({'Observation Time':'2026-10-12 00:00','Forecast Time':'2026-10-12 00:30',
                          'coordinates':[[0,70,10],[1,70,10],[0,30,90],[4,72,12]]})
  self.assertEqual(len(d['points']),2);self.assertEqual(d['points'][1],[4,72,12])
 def test_history_update_writes_only_for_new_samples(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'data').mkdir()
   timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat()
   sample={'time':timestamp,'kp':6.0,'g':'G2'}
   with patch.object(space,'ROOT',root):
    space.history_update([sample])
    path=root/'data/history.json'
    first=path.read_text(); first_mtime=path.stat().st_mtime_ns
    space.history_update([sample])
    self.assertEqual(first,path.read_text())
    self.assertEqual(first_mtime,path.stat().st_mtime_ns)
    space.history_update([{'time':timestamp,'kp':7.0,'g':'G3'}])
    self.assertNotEqual(first,path.read_text())
    self.assertEqual(json.loads(path.read_text())['kp_samples'][0]['kp'],7.0)
 def test_active_satellite(self):
  r=space.latest_active([{'time_tag':'2026-10-12T00:00','active':True,'bz_gsm':-5},
                         {'time_tag':'2026-10-12T00:01','active':False,'bz_gsm':-25}])
  self.assertEqual(r['bz_gsm'],-5)
if __name__=='__main__':unittest.main()
