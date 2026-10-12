/** Sun and Moon positions from the low-precision astronomical algorithms commonly
 * used in SunCalc (BSD-2-Clause, Vladimir Agafonkin). Angular error is small for
 * observational planning, not for navigation or precise occultation predictions.
 * We calculate on demand; no external astronomy API or private coordinates sent.
 */
const rad = Math.PI / 180;
const E = rad * 23.4397;
const J1970 = 2440588;
const J2000 = 2451545;
const dms = 1000 * 60 * 60 * 24;
const toDays = date => date.getTime() / dms - 0.5 + J1970 - J2000;
const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
function sunCoords(d) {
  const M = rad * (357.5291 + 0.98560028 * d);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  return {ra: rightAscension(L, 0), dec: declination(L, 0)};
}
function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d);
  const M = rad * (134.963 + 13.064993 * d);
  const F = rad * (93.272 + 13.229350 * d);
  const l = L + rad * 6.289 * Math.sin(M);
  const b = rad * 5.128 * Math.sin(F);
  return { ra: rightAscension(l,b), dec: declination(l,b), dist: 385001 - 20905 * Math.cos(M) };
}
function pos(date, lat, lon, moon=false) {
  const d = toDays(date);
  const lw = -lon * rad;
  const phi = lat * rad;
  const c = moon ? moonCoords(d) : sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  // Refraction near the horizon: 0.017 rad approx for bodies close to horizon.
  const h = altitude(H, phi, c.dec);
  const correction = moon ? (h > -0.1 ? 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179)) : 0) : 0;
  return { alt: (h + correction) / rad };
}
export function skyAt(date, lat, lon) {
  const d = toDays(date);
  const s = sunCoords(d), m = moonCoords(d);
  const phi = Math.acos(Math.max(-1, Math.min(1, Math.sin(s.dec)*Math.sin(m.dec) + Math.cos(s.dec)*Math.cos(m.dec)*Math.cos(s.ra-m.ra))));
  const inc = Math.atan2(149598000 * Math.sin(phi), m.dist - 149598000 * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec)*Math.sin(s.ra-m.ra), Math.sin(s.dec)*Math.cos(m.dec) - Math.cos(s.dec)*Math.sin(m.dec)*Math.cos(s.ra-m.ra));
  return {
    sunAlt: pos(date, lat, lon).alt,
    moonAlt: pos(date, lat, lon, true).alt,
    moonFraction: Math.max(0, Math.min(1, (1 + Math.cos(inc)) / 2)),
    moonPhase: ((0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI) % 1 + 1) % 1
  };
}
export function moonPhaseName(phase) {
  if (phase < 0.035 || phase > 0.965) return 'Nymåne';
  if (phase < 0.215) return 'Tiltagende segl';
  if (phase < 0.285) return 'Første kvarter';
  if (phase < 0.465) return 'Tiltagende måne';
  if (phase < 0.535) return 'Fuldmåne';
  if (phase < 0.715) return 'Aftagende måne';
  if (phase < 0.785) return 'Sidste kvarter';
  return 'Aftagende segl';
}
export function moonGlyph(phase) {
  if (phase < .035 || phase > .965) return '🌑';
  if (phase < .215) return '🌒';
  if (phase < .285) return '🌓';
  if (phase < .465) return '🌔';
  if (phase < .535) return '🌕';
  if (phase < .715) return '🌖';
  if (phase < .785) return '🌗';
  return '🌘';
}
/** Next rising/setting crossings within the next 30 hours, by altitude sampling. */
export function nextMoonEvents(start, lat, lon) {
  const step = 6 * 60 * 1000, end = start.getTime() + 30 * 3600000;
  const out = {rise:null,set:null};
  let prev = skyAt(start,lat,lon).moonAlt;
  for (let t = start.getTime()+step; t <= end; t += step) {
    const curr = skyAt(new Date(t),lat,lon).moonAlt;
    if (prev <= 0 && curr > 0 && !out.rise) out.rise = new Date(t - step * curr / (curr-prev));
    if (prev >= 0 && curr < 0 && !out.set) out.set = new Date(t - step * curr / (curr-prev));
    if (out.rise && out.set) break;
    prev = curr;
  }
  return out;
}
export function darkHoursNext24(start, lat, lon) {
  const intervals = [];
  for (let i=0; i<=48; i++) {
    const d = new Date(start.getTime()+i*30*60000);
    if (skyAt(d,lat,lon).sunAlt < -12) intervals.push(d);
  }
  return intervals;
}
