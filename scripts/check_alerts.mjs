/**
 * Nordlysradar: personlige nordlysalarmer via GitHub Actions.
 *
 * GitHub Actions-secret: NORDLYS_ALERT_CONFIG (JSON fra appens indstillinger).
 * Valgfri manuel test: SEND_TEST=true.
 *
 * Lokation, koordinater, ntfy-topic og beskedindhold logges ikke.
 * Kun afsendelsestidspunkter og alarmtype gemmes i data/alert-state.json.
 *
 * Node.js 22. Ingen ekstra npm-pakker.
 *
 * 2026-11-15: Robust NOAA Kp-hentning med formatkontrol og officielle reservefeeds.
 * En observeret Kp-vaerdi bliver aldrig fremlagt som en prognose.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nextAlert, recordAlert } from '../lib/alerts.js';
import { getWeather } from '../lib/data.js';

const STATE_PATH = 'data/alert-state.json';
const HOUR = 60 * 60 * 1000;
const RETRY_DELAYS = [1500, 3500];
const NOAA_PRIMARY = 'https://services.swpc.noaa.gov';
const NOAA_MIRROR = 'https://services.swpc.woc.noaa.gov';
const NOAA_AGENT = 'Nordlysradar/1.2 (https://github.com/mikkelfamme/Nordlysradar)';
const Kp_TIMEOUT_MS = 14000;

function parseSettings(raw) {
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('NORDLYS_ALERT_CONFIG er ikke gyldig JSON.');
  }
  if (
    !data ||
    data.schema_version !== 1 ||
    !data.location ||
    !Number.isFinite(data.location.lat) ||
    !Number.isFinite(data.location.lon) ||
    Math.abs(data.location.lat) > 90 ||
    Math.abs(data.location.lon) > 180
  ) {
    throw new Error('Alarmkonfigurationen mangler en gyldig lokation.');
  }
  if (!/^[a-zA-Z0-9_-]{14,90}$/.test(data.ntfyTopic || '')) {
    throw new Error('ntfy-topic er ikke gyldig. Brug en lang tilfaeldig noegle.');
  }
  if (data.ntfyServer && data.ntfyServer !== 'https://ntfy.sh/') {
    throw new Error('Kun https://ntfy.sh/ understoettes.');
  }
  return {
    ...data,
    light: ['city', 'suburb', 'dark'].includes(data.light) ? data.light : 'suburb',
    mode: data.mode === 'camera' ? 'camera' : 'eye',
    alerts: true,
  };
}

function httpStatus(error) {
  if (Number.isInteger(error?.status)) return error.status;
  const match = /^HTTP (\d{3})$/.exec(error?.message || '');
  return match ? Number(match[1]) : null;
}

// Kun korte fejlkoder: aldrig rae URL'er, koordinater eller ntfy-payloads.
function errorSummary(error) {
  const status = httpStatus(error);
  if (status !== null) return `HTTP ${status}`;
  if (['NO_KP_VALUES', 'STALE_KP_VALUES', 'BAD_KP_FORMAT'].includes(error?.code)) {
    return error.code;
  }
  const code = error?.cause?.code || error?.cause?.cause?.code || error?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]{2,60}$/.test(code)) return code;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'timeout';
  if (error?.name === 'SyntaxError') return 'ugyldigt JSON-svar';
  if (error?.message === 'fetch failed') return 'fetch failed';
  return error?.name === 'TypeError' ? 'netvaerksfejl' : 'ugyldigt eller manglende data';
}

function temporaryError(error) {
  const status = httpStatus(error);
  return status === null || status === 408 || status === 425 ||
    status === 429 || (status >= 500 && status <= 599);
}

const sleep = ms => new Promise(done => setTimeout(done, ms));
async function retryService(service, task, {
  attempts = 3,
  httpOnly = false,
  skipRetryOn429 = false,
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      const status = httpStatus(error);
      const canRetry = temporaryError(error) && (!httpOnly || status !== null) &&
        !(skipRetryOn429 && status === 429);
      console.warn(`${service}: forsoeg ${attempt}/${attempts} fejlede (${errorSummary(error)}).`);
      if (attempt === attempts || !canRetry) {
        throw new Error(`${service} fejlede: ${errorSummary(error)}.`, { cause: error });
      }
      await sleep(RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]);
    }
  }
  throw new Error(`${service} fejlede uden resultat.`);
}

async function fetchNoaaJSON(url, timeoutMs = Kp_TIMEOUT_MS) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': NOAA_AGENT, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// NOAA-tider uden timezone angives i UTC. Undgaa browserens lokale timezone.
function noaaTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  const stamp = /[zZ]$|[+-]\d\d:\d\d$/.test(value)
    ? value : value.replace(' ', 'T') + 'Z';
  return Date.parse(stamp);
}

function dataError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

/**
 * Understoetter baade NOAA's nuvaerende objektformat og deres tidligere
 * header+raekke-format. Det observerede 3-timers feed bruger 'Kp' (stort K),
 * hvorimod prognosefeedet bruger 'kp' (lille k).
 */
export function normalizeKp(input) {
  const raw = Array.isArray(input) ? input : (Array.isArray(input?.data) ? input.data : []);
  if (!raw.length) return [];

  let records = raw;
  if (Array.isArray(raw[0]) && raw[0].some(v => typeof v === 'string' && /^(time_tag|kp|observed)$/i.test(v))) {
    const keys = raw[0].map(String);
    records = raw.slice(1).map(row => {
      if (!Array.isArray(row)) return null;
      return Object.fromEntries(keys.map((key, i) => [key, row[i]]));
    });
  }

  const out = [];
  for (const row of records) {
    if (!row || Array.isArray(row) || typeof row !== 'object') continue;
    const date = row.time_tag ?? row.time;
    const time = noaaTimestamp(date);
    const rawKp = row.kp ?? row.Kp ?? row.kp_index;
    if (rawKp === null || rawKp === undefined || rawKp === '') continue;
    const kp = Number(rawKp);
    if (!Number.isFinite(time) || !Number.isFinite(kp) || kp < 0 || kp > 9) continue;
    const kind = row.observed === 'predicted' ? 'predicted' :
      row.observed === 'estimated' ? 'estimated' : 'observed';
    out.push({ time: new Date(time).toISOString(), kp, kind, g: row.noaa_scale ?? null });
  }
  const unique = new Map();
  for (const row of out) unique.set(row.time, row);
  return [...unique.values()].sort((a, b) => noaaTimestamp(a.time) - noaaTimestamp(b.time));
}

function hasRelevantKp(rows, now) {
  const t = now.getTime();
  return rows.some(row => {
    const time = noaaTimestamp(row.time);
    // Et Kp-punkt daekker det efterfoelgende 3-timers interval.
    // Krav om aktuel daekning forhindrer varsler paa baggrund af
    // gamle fremtidsprognoser, som endnu ligger i JSON-filen.
    return Number.isFinite(time) && time <= t && t < time + 3 * HOUR;
  });
}

async function fetchKpFeed(source, now) {
  return retryService(source.label, async () => {
    const raw = await fetchNoaaJSON(source.url);
    if (!Array.isArray(raw) && !Array.isArray(raw?.data)) throw dataError('BAD_KP_FORMAT');
    const kp = normalizeKp(raw);
    if (!kp.length) throw dataError('NO_KP_VALUES');
    if (!hasRelevantKp(kp, now)) throw dataError('STALE_KP_VALUES');
    return kp;
  }, { attempts: source.attempts, skipRetryOn429: true });
}

/**
 * Foerst den officielle Kp-prognose, dernaest NOAAs alternative vaert,
 * og sidst officielle observerede Kp-maalinger. Der opfindes IKKE
 * fremtidsprognoser ud fra gamle maalinger.
 */
export async function loadLiveSpace(now = new Date()) {
  const sources = [
    { label: 'NOAA Kp-prognose', url: `${NOAA_PRIMARY}/products/noaa-planetary-k-index-forecast.json`, attempts: 2, forecast: true },
    { label: 'NOAA Kp-prognose (reservehost)', url: `${NOAA_MIRROR}/products/noaa-planetary-k-index-forecast.json`, attempts: 1, forecast: true },
    { label: 'NOAA Kp-maaling', url: `${NOAA_PRIMARY}/products/noaa-planetary-k-index.json`, attempts: 2, forecast: false },
    { label: 'NOAA Kp-maaling (reservehost)', url: `${NOAA_MIRROR}/products/noaa-planetary-k-index.json`, attempts: 1, forecast: false },
  ];

  let kp = null;
  let forecast = false;
  for (const source of sources) {
    try {
      kp = await fetchKpFeed(source, now);
      forecast = source.forecast;
      console.log(`${source.label}: OK (${kp.length} datapunkter).`);
      break;
    } catch (error) {
      console.warn(`${source.label}: skifter kilde (${errorSummary(error.cause || error)}).`);
    }
  }
  if (!kp) {
    throw new Error('Ingen aktuelle Kp-data fra NOAA eller reservehost. Ingen nordlysalarm sendt.');
  }
  if (!forecast) {
    console.warn('NOAA-prognoser utilgaengelige; bruger kun observeret Kp. Ingen kunstige fremtidsprognoser.');
  }

  let aurora = {};
  try {
    aurora = compactAurora(await retryService('NOAA OVATION', () =>
      fetchNoaaJSON(`${NOAA_PRIMARY}/json/ovation_aurora_latest.json`, 10000),
    { attempts: 2, skipRetryOn429: true }));
  } catch {
    // OVATION er et supplement; en aktuel Kp-maaling er nok til en basal vurdering.
    console.warn('NOAA OVATION er utilgaengelig; vurderingen bruger Kp alene.');
  }
  return { kp, aurora, kpSource: forecast ? 'forecast' : 'observed', updated_at: new Date().toISOString() };
}

function compactAurora(raw) {
  const points = Array.isArray(raw?.coordinates) ? raw.coordinates : [];
  return {
    forecast_time: raw?.['Forecast Time'] || null,
    observation_time: raw?.['Observation Time'] || null,
    points: points.filter(point =>
      Array.isArray(point) && point.length >= 3 &&
      point[1] >= 38 && point[1] <= 90 && point[2] >= 2 &&
      point[0] % 2 === 0 && point[1] % 2 === 0,
    ),
  };
}

function hasCurrentWeather(weather, now) {
  const hours = weather?.hourly?.time;
  return Array.isArray(hours) && hours.some(timestamp => {
    const timeMs = Number(timestamp) * 1000;
    return Number.isFinite(timeMs) && Math.abs(timeMs - now.getTime()) <= HOUR;
  });
}

function buildAppURL() {
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
  return owner && repo ? `https://${owner}.github.io/${repo}/` : '';
}

async function notify(event, topic, link) {
  const payload = {
    topic,
    title: event.title,
    message: event.message,
    priority: event.priority,
    tags: ['milky_way'],
    ...(link ? {
      click: link,
      actions: [{ action: 'view', label: '\u00c5bn Nordlysradar', url: link }],
    } : {}),
  };
  return retryService('ntfy push', async () => {
    const response = await fetch('https://ntfy.sh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
  }, {
    attempts: 3,
    // Ingen gentagelse ved tvetydig netvaerksfejl efter POST:
    // ntfy kan have accepteret beskeden, selvom svaret gik tabt.
    httpOnly: true,
  });
}

async function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  let state;
  try {
    state = JSON.parse(await readFile(STATE_PATH, 'utf8'));
  } catch {
    throw new Error('Kunne ikke laese alarmhistorikken. Stopper for at undgaa dubletter.');
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('Alarmhistorikken har ugyldigt format. Stopper for at undgaa dubletter.');
  }
  return state;
}

export async function runAlertCheck({
  config = process.env.NORDLYS_ALERT_CONFIG,
  now = new Date(),
  getSpace = loadLiveSpace,
  getWx = getWeather,
  send = notify,
  readState = null,
  saveState = null,
  testMode = process.env.SEND_TEST === 'true',
} = {}) {
  const settings = parseSettings(config);
  if (!settings) {
    console.log('Ingen alarm konfigureret. Tilfoej NORDLYS_ALERT_CONFIG under GitHub Actions Secrets.');
    return { status: 'not_configured' };
  }
  if (testMode) {
    await send({
      kind: 'test',
      title: 'Nordlysradar er tilsluttet',
      message: 'Dette er en test. Du f\u00e5r automatisk besked, n\u00e5r dine nordlysbetingelser opfyldes.',
      priority: 3,
    }, settings.ntfyTopic, buildAppURL());
    console.log('Test-push sendt.');
    return { status: 'test_sent' };
  }

  const last = readState ? await readState() : await loadState();
  const [space, weather] = await Promise.all([
    getSpace(now),
    retryService('Open-Meteo', async () => {
      const result = await getWx(settings.location);
      if (!hasCurrentWeather(result, now)) throw new Error('Ingen aktuelle vejrdata');
      return result;
    }),
  ]);
  // Hvis NOAA kun leverer observationer, maa de ikke udloese fremtidsvarsler.
  const alertSettings = space?.kpSource === 'observed'
    ? { ...settings, alertSoon: false, alertStorm: false }
    : settings;
  const event = nextAlert(now, settings.location, space, weather, alertSettings, last);
  if (!event) {
    console.log('Kontrol fuldfoert. Ingen ny nordlysalarm.');
    return { status: 'no_alert' };
  }

  await send(event, settings.ntfyTopic, buildAppURL());
  const updated = recordAlert(last, event, now);
  if (saveState) await saveState(updated);
  else await writeFile(STATE_PATH, JSON.stringify(updated, null, 2) + '\n');
  console.log(`Alarm sendt: ${event.kind}. Kun afsendelsestidspunkter gemmes.`);
  return { status: 'sent', kind: event.kind };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAlertCheck().catch(error => {
    // Intet stacktrace eller rae fejlobjekter: skaan koordinater i logs.
    console.error('Nordlysradar alarmcheck fejlede:', error.message);
    process.exitCode = 1;
  });
}
