/**
 * Nordlysradar: personlige nordlysalarmer via GitHub Actions.
 *
 * Kræver GitHub Actions-secret: NORDLYS_ALERT_CONFIG (JSON fra appens indstillinger).
 * Valgfri manuel test: SEND_TEST=true.
 *
 * Lokation, koordinater, ntfy-topic og beskeder skrives aldrig til GitHub-loggen
 * eller repositoryet. Kun tidspunkt og type for seneste alarm gemmes i
 * data/alert-state.json.
 *
 * Node.js 22. Ingen ekstra npm-pakker.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nextAlert, recordAlert } from '../lib/alerts.js';
import { getWeather } from '../lib/data.js';

const STATE_PATH = 'data/alert-state.json';
const NOAA = 'https://services.swpc.noaa.gov';
const HOUR = 60 * 60 * 1000;
const RETRY_DELAYS = [1500, 3500];

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
    throw new Error('ntfy-topic er ikke gyldig. Brug en lang tilfældig nøgle.');
  }
  if (data.ntfyServer && data.ntfyServer !== 'https://ntfy.sh/') {
    throw new Error('Kun https://ntfy.sh/ understøttes.');
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

// Kun korte, ikke-personlige fejlkoder i GitHub-loggen.
function errorSummary(error) {
  const status = httpStatus(error);
  if (status !== null) return `HTTP ${status}`;

  const code = error?.cause?.code || error?.cause?.cause?.code || error?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]{2,60}$/.test(code)) return code;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'timeout';
  if (error?.name === 'SyntaxError') return 'ugyldigt JSON-svar';
  if (error?.message === 'fetch failed') return 'fetch failed';
  return error?.name === 'TypeError' ? 'netværksfejl' : 'ugyldigt eller manglende data';
}

function temporaryError(error) {
  const status = httpStatus(error);
  return status === null || status === 408 || status === 425 ||
    status === 429 || (status >= 500 && status <= 599);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function retryService(service, task, { attempts = 3, httpOnly = false } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      const status = httpStatus(error);
      const canRetry = temporaryError(error) && (!httpOnly || status !== null);
      console.warn(`${service}: forsøg ${attempt}/${attempts} fejlede (${errorSummary(error)}).`);

      if (attempt === attempts || !canRetry) {
        throw new Error(`${service} fejlede: ${errorSummary(error)}.`, { cause: error });
      }
      await sleep(RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]);
    }
  }
}

async function fetchNoaaJSON(path, timeoutMs) {
  const response = await fetch(NOAA + path, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'Nordlysradar/1.1 (personal aurora alert system)' },
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function normalizeKp(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(row => row && row.time_tag && row.kp != null && Number.isFinite(Number(row.kp)))
    .map(row => ({
      time: row.time_tag,
      kp: Number(row.kp),
      kind: row.observed === 'predicted' ? 'predicted' :
        row.observed === 'estimated' ? 'estimated' : 'observed',
    }));
}

function compactAurora(raw) {
  const points = Array.isArray(raw?.coordinates) ? raw.coordinates : [];
  return {
    forecast_time: raw?.['Forecast Time'] || null,
    observation_time: raw?.['Observation Time'] || null,
    points: points.filter(point =>
      Array.isArray(point) && point.length >= 3 &&
      point[1] >= 38 && point[1] <= 90 && point[2] >= 2 &&
      point[0] % 2 === 0 && point[1] % 2 === 0
    ),
  };
}

// NOAA-tidspunkter uden eksplicit tidszone er UTC.
function noaaTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  const time = /[zZ]$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T') + 'Z';
  return Date.parse(time);
}

async function loadLiveSpace(now = new Date()) {
  const kp = await retryService('NOAA Kp', async () => {
    const rows = await fetchNoaaJSON('/products/noaa-planetary-k-index-forecast.json', 15000);
    const normalized = normalizeKp(rows);
    if (!normalized.length) throw new Error('Ingen gyldige Kp-værdier');
    if (!normalized.some(row => {
      const time = noaaTimestamp(row.time);
      return Number.isFinite(time) && time >= now.getTime() - 4 * HOUR &&
        time <= now.getTime() + 4 * HOUR;
    })) {
      throw new Error('Kp-prognosen dækker ikke det aktuelle tidsrum');
    }
    return normalized;
  });

  let aurora = {};
  try {
    aurora = compactAurora(await retryService('NOAA OVATION', () =>
      fetchNoaaJSON('/json/ovation_aurora_latest.json', 10000), { attempts: 2 }
    ));
  } catch {
    // OVATION er et supplement. Kp-data er tilstrækkelige til den almindelige vurdering.
    console.warn('NOAA OVATION er utilgængelig; vurderingen bruger Kp alene.');
  }

  return { kp, aurora, updated_at: new Date().toISOString() };
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
      actions: [{ action: 'view', label: 'Åbn Nordlysradar', url: link }],
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
    // Ingen automatisk gentagelse ved tvetydig netværksfejl efter POST:
    // ntfy kan have modtaget beskeden, selv om svaret gik tabt.
    httpOnly: true,
  });
}

async function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  let state;
  try {
    state = JSON.parse(await readFile(STATE_PATH, 'utf8'));
  } catch {
    throw new Error('Kunne ikke læse alarmhistorikken. Stopper for at undgå dubletter.');
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('Alarmhistorikken har ugyldigt format. Stopper for at undgå dubletter.');
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
    console.log('Ingen alarm konfigureret. Tilføj NORDLYS_ALERT_CONFIG under GitHub Actions Secrets.');
    return { status: 'not_configured' };
  }

  if (testMode) {
    await send({
      kind: 'test',
      title: 'Nordlysradar er tilsluttet',
      message: 'Dette er en test. Du får automatisk besked, når dine nordlysbetingelser opfyldes.',
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

  const event = nextAlert(now, settings.location, space, weather, settings, last);
  if (!event) {
    console.log('Kontrol fuldført. Ingen ny nordlysalarm.');
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
    // Intet stacktrace eller rå fejlobjekt: undgå URL'er med koordinater i logs.
    console.error('Nordlysradar alarmcheck fejlede:', error.message);
    process.exitCode = 1;
  });
}
