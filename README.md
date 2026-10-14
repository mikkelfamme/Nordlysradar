# Nordlysradar · V1.1

En dansk, mobilvenlig Progressive Web App (PWA) til personligt nordlysvarsel. Appen kombinerer officielle målinger fra **NOAA Space Weather Prediction Center** med skyer fra **Open-Meteo**, månelys, mørke og din placering.

Bygget til en enkel GitHub Pages-installation – ingen database eller betalt service er nødvendig for appen. Baggrundsalarmer kræver en separat GitHub Actions-secret og gratisappen ntfy; en rigtig iPhone-widget kræver gratisappen Scriptable.

## Hvad kan V1.1?

**NYT:** [Læs vejledningen til V1.1 og opdatering af eksisterende app](./OPDATERING-V1.1.md). Brug ZIP-filen med `-OPDATERING` i navnet til dit eksisterende repository – den beskytter NOAA-historikken. `-KOMPLET` er kun til en helt ny installation.

- **Overblik:** observationsindeks (0–100), status, Kp, skydække, månebelysning og nattens bedste tidspunkt.
- **Op til 72-timers prognose:** time for time, med tydelig adskillelse af observeret, estimeret og forudsagt Kp, og forsigtighed over for usikre langtidsprognoser.
- **Måne & himmel:** månens fase og oplysningsgrad, månehøjde, næste op- og nedgang, solhøjde, mørke og skyniveauer.
- **Solstorme:** Kp/G, solvindshastighed, Bz, NOAA-stormmeddelelser, polarkort med OVATION-nordlyszonen og registrerede stormperioder.
- **Steder:** GPS, søgning efter byer og steder og sammenligning af gemte placeringer.
- **Indstillinger:** kamera/øje, manuel lysforurening, personligt alarmniveau, automatisk opdatering.
- **Observationer:** egen observationslog gemt lokalt, eksport/import af backup.
- **Interaktivt nordlyskort (NYT):** geografisk kort, NOAA-farvelag, zoom/pan, klik på modelpunkter, aktuel lokation og ON/OFF-overlay.
- **Personlige push-alarmer (NYT):** vurderer aktivitet, mørke, skyer, stormprognoser og brugerens scoregrænse. Planlagt baggrundskontrol cirka hvert 15. minut via GitHub Actions og ntfy. Der er en særlig test-push.
- **Ægte iPhone-widget (NYT):** separat Scriptable-script med live Kp, måne, skyer og observationsindeks for dine koordinater.
- **PWA:** ikon på iPhone-/Android-hjemmeskærmen, offline brugerflade (prognoser kræver forbindelse).

**OBS:** Indekset er en *heuristisk observationsscore*, ikke en statistisk sandsynlighed i procent. Månen og skydækket kan begrænse eller helt skjule nordlys. Høj Kp garanterer ikke lokalt nordlys, særligt ikke i Danmark. Kp er globalt; appens latitudeffekt er en forenkling. Et længerevarende observationsindeks er betydeligt mere usikkert end korttidsprognoserne.

## Sådan gør du appen klar på GitHub Pages

### A. Opret dit repository

1. Pak `Nordlysradar-v1.1-KOMPLET.zip` ud, så du har en mappe med `index.html`, `app.js`, `lib/`, `assets/`, `data/`, `widget/` og `.github/workflows/`.
2. Gå til GitHub og opret et nyt repository med navnet **`nordlysradar`** (forventet bruger: `mikkelfamme`).
3. Vælg **Public**, hvis du bruger gratis GitHub Pages. Webappen får en offentlig URL. Dine lokale indstillinger og observationer uploades ikke til GitHub.
4. Læg **indholdet** af mappen – ikke zip-filen – i repositoryets rod. **Vigtigt:** Få den skjulte mappe `.github/workflows/` med, ellers opdateres nordlysdata ikke automatisk.

En reproducerbar CLI-metode fra den udpakkede mappe:

```bash
git init -b main
git add .
git commit -m "Nordlysradar V1"
git remote add origin https://github.com/mikkelfamme/nordlysradar.git
git push -u origin main
```

GitHub-repositoryet skal være oprettet på forhånd. Hvis Git beder om login, skal du bruge din almindelige GitHub-godkendelse (f.eks. GitHub CLI eller credential manager).

### B. Slå automatisk udgivelse til

1. Åbn repositoryets **Settings → Pages**.
2. Under **Build and deployment → Source**, vælg **GitHub Actions** (ikke “Deploy from a branch”).
3. Åbn **Actions → Opdater og udgiv Nordlysradar**.
4. Vælg **Run workflow → main → Run workflow**. Vent på, at *build* og *deploy* bliver grønne.
5. Åbn `https://mikkelfamme.github.io/nordlysradar/`.

Data-publiceringsworkflowet kører normalt hver halve time (kl. `xx:07` og `xx:37` UTC), henter NOAA-data og udgiver en opdateret side. Kun nye eller ændrede Kp-historikpunkter skrives tilbage til repositoryet; de hyppige live-snapshots medfører ikke unødvendige Git-commits. GitHubs planlagte workflows kan blive forsinkede eller stoppet ved længerevarende repo-inaktivitet. Se **Actions** ved manglende opdateringer. Ved fejl i datakilderne beholder appen seneste snapshot, og data bliver automatisk markeret som forældede.

**Vigtigt:** Historik bliver opbygget fra de observerede Kp-data, NOAA aktuelt tilbyder, og efterfølgende indsamlede målinger. Appen indeholder ingen fabrikeret historik fra tidligere år. Det kan tage lidt tid efter første workflowkørsel, før alle visninger har data.

### C. Installer på telefonen

**iPhone:** Åbn URL'en i Safari, tryk Del, og vælg *Føj til hjemmeskærm*.

**Android:** Åbn URL'en i Chrome og vælg *Installer app* eller *Føj til startskærm*.

GPS kræver en sikker HTTPS-forbindelse; GitHub Pages leverer dette som standard. Første visning bruger København som udgangspunkt, indtil du vælger din egen placering.

## Sådan henter appen data

| Del | Kilde | Kadence / forventning |
| --- | --- | --- |
| Kp og Kp-prognose | NOAA `noaa-planetary-k-index-forecast.json` | Opdateres via GitHub Actions ca. hver 30. minut |
| OVATION nordlysoval | NOAA `json/ovation_aurora_latest.json` | Viser nærprognose 30–90 minutter frem |
| Solvind (Bz, km/s, tæthed) | NOAA `json/rtsw/rtsw_mag_1m.json` og `rtsw_wind_1m.json` | Indgår i seneste snapshot |
| Stormvarsler | NOAA `products/alerts.json` | Seneste tilgængelige meddelelser |
| Skyer, sigtbarhed | Open-Meteo Forecast API | Hentes ved åbning, ved skift af sted og under automatisk kontrol |
| Sol og måne | Astronomiske beregninger i browseren | Beregnes på lokationen og tidspunktet |

Appen tjekker data cirka hvert femte minut, mens den er åben. NOAA-snapshot udgives cirka hver halve time; hvis det er forældet, forsøger appen at hente direkte fra NOAA, hvis browserens CORS-regler tillader det. Særligt NOAAs korttidsprognose og flerdøgnsprognosen er to forskellige datagrundlag og må ikke forveksles.

### Hvordan observationsindekset bruges

- Først beregnes et *aktivitetssignal* ud fra Kp, geografisk breddegrad og (når tilgængelig og aktuel) OVATION-ovalen.
- Så påvirkes scoren kraftigt af, om solen er gået langt nok ned, og af samlet skydække.
- Synlig måne, månens belysning, manuelt valgt lysforurening og dårlig sigtbarhed sænker scoren.
- Kameratilstand er mere følsom end øjetilstand.
- Mangler enten en egnet Kp/OVATION-måling eller vejrdata, vises **ingen** score frem for et opfundet tal.
- Fremtidige timer anvender NOAA Kp-prognose og *ikke* den aktuelle nordlysoval.

Denne beregning er foreløbig; tærsklerne kan justeres, hvis brugerens observationer giver grundlag for bedre kalibrering.

## Begrænsninger i V1.1

- **Push kræver opsætning.** Baggrundsalarmer er bygget via GitHub Actions + ntfy, men du skal konfigurere den private kanal og GitHub-secret. GitHub kan forsinke planlagte kontroller; der er ingen realtidsgaranti.
- **Widget via Scriptable.** En native iPhone-widget leveres som et Scriptable-script, der kræver installation og konfiguration i Scriptable. PWA'en kan ikke installere widgetten direkte. iOS bestemmer dens opdateringshyppighed.
- **Ingen automatisk lysforureningsmåling.** Vælg selv By, Forstad eller Mørkt sted. Sammenligning af steder bruger samme manuelle indstilling.
- **Ikke en verificeret aurora-probabilitetsmodel.** Kun et observationsindeks med kendte usikkerheder.
- **Ikke fuld 90-dages historik på dag 1.** Arkivet opbygges gradvist. Flerdøgnsprognosen viser maksimalt 72 timer; ved kortere NOAA-prognosehorisont markeres de sidste timer som ukendte.
- **GitHub Pages er offentligt tilgængeligt på sin URL.** Lokale brugerdata bliver på enheden.

## Privatliv

For at aktivere baggrundsalarmer bliver din valgte placering og din tilfældige, private ntfy-kanal lagret som **GitHub Actions-repository-secret** (du indsætter den selv), og beskeder sendes via **ntfy.sh**. Disse værdier findes ikke i webappens offentlige filer. Et ntfy-topic på gratis-tjenesten er ikke en adgangskontrolleret privat postkasse. Hold kanalen hemmelig. Backup af dine browserindstillinger indeholder kanalnavnet.

- GPS-pladsvalg er frivilligt. Det bruges lokalt i appen og koordinater sendes til Open-Meteo for vejrdata.
- Stedsøgninger sendes til Open-Meteo Geocoding API.
- Gemte steder, appindstillinger og observationsnoter lagres via `localStorage` på enheden, ikke på GitHub og ikke hos OpenAI.
- Backupfilen indeholder eventuelle lokaliteter og observationsnoter; opbevar den sikkert.
- NOAA's rumvejrsdata er offentlige, og Open-Meteo tilbyder gratis ikke-kommerciel adgang mod kildeangivelse.

## Tests og lokal udvikling

Appen kræver hverken `npm install` eller bundling. Hvis du har Node.js, kan du køre:

```bash
npm test
python3 -m unittest discover -s tests -p 'test_noaa_script.py' -v
```

For lokal udvikling skal appen åbnes via en HTTP-server (ES modules virker normalt ikke direkte med `file://`):

```bash
python3 -m http.server 8080
```

Åbn derpå `http://localhost:8080/`.

`tests/check_ui.py` laver offline browser-UI-tests med isolerede **syntetiske testdata**, ikke NOAA-live-målinger. Tests og previews inkluderes ikke i den udgivne GitHub Pages-artifact.

## Referencer og kreditering

- [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/)
- [NOAA Aurora – 30-minute forecast](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast)
- [Open-Meteo Forecast API](https://open-meteo.com/en/docs) (CC BY 4.0 attribution)
- [SunCalc](https://github.com/mourner/suncalc) (BSD-2-Clause; astronomiske algoritmer er tilpasset, fuld licens i `LICENSE-SUNCALC.txt`)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [ntfy push API](https://docs.ntfy.sh/publish/)
- [Scriptable ListWidget](https://docs.scriptable.app/listwidget/)
- [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/)
