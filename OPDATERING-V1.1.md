# Nordlysradar V1.1 – opdater din eksisterende app

Denne version bygger videre på Nordlysradar V1.0. Dine gemte steder, indstillinger og observationer bevares **på samme enhed og under samme webadresse**, fordi appen fortsat bruger de eksisterende localStorage-nøgler.

## 1. Opdater GitHub-repositoryet

Brug **opdateringspakken**, hvis du allerede har Nordlysradar på GitHub. Den komplette ZIP er beregnet til en *helt ny* installation og indeholder tomme startdata, som ikke må overskrive dine nuværende NOAA-historikdata.

1. Pak **`Nordlysradar-v1.1-OPDATERING.zip`** ud på computeren.
2. **Kopiér alle filer og mapper i opdateringspakken** til roden af dit eksisterende `nordlysradar`-repository. Opdateringspakken indeholder kun nye eller ændrede programfiler. Den indeholder **ikke** `data/history.json`, `data/space-weather.json` eller `data/alert-state.json`, så dine historiske NOAA-målinger og alarmstatus ikke bliver overskrevet.
3. Sørg især for, at den skjulte mappe `.github/workflows/` følger med. Den indeholder nu **to** workflows: `publish.yml` og `alerts.yml`.
4. Commit/push til `main`.
5. I GitHub: `Settings → Pages → Build and deployment → Source: GitHub Actions`. Tjek derefter, at **Opdater og udgiv Nordlysradar** kører grønt under `Actions`.
6. Åbn appen på telefonen. Hvis den viser det gamle design, så luk den helt, og åbn den igen. Serviceworker-cachen er opgraderet fra V1 til V1.1.

**Terminalmetode**, hvis dit eksisterende repository allerede er hentet lokalt (kør fra mappen med `index.html`):

```bash
git status
# Kopiér hele indholdet af den udpakkede ZIP ind i repositoryets rod.
git add -A
git commit -m "Nordlysradar V1.1: alarmer, interaktivt kort og iPhone-widget"
git push origin main
```

## 2. Interaktivt nordlyskort – virker umiddelbart

Åbn **Solstorme** i appen. Kortet indeholder nu:

- Almindeligt geografisk kort fra OpenStreetMap.
- NOAA OVATION-nordlysaktivitet oven på kortet som et farvet aktivitetslag.
- En markering af din valgte lokation.
- Træk for at flytte, knib med fingrene for at zoome eller brug +/−.
- Tryk på en placering for at se nærmeste relevante NOAA-modelmåling.
- Slå aktivitetslaget til/fra, eller nulstil visningen omkring din lokation.

**Vigtigt:** Intensitet på kortet er ikke en procentuel sandsynlighed. Gamle NOAA-prognoser skjules automatisk, og OpenStreetMap-tiles vises kun, hvis der er internetforbindelse.

## 3. Intelligente iPhone-alarmer – først efter opsætning

Du får ikke baggrundsalarmer ved blot at installere ZIP-filerne. De kræver *ntfy* på telefonen og én hemmelig indstilling i GitHub.

1. Installer **ntfy** fra App Store: https://apps.apple.com/app/ntfy/id1625396347
2. Åbn **Nordlysradar → Indstillinger → Intelligente nordlysalarmer**. Vælg grænser, forvarsler og eventuelle stilleperioder.
3. Tryk **Opret alarmkanal**. Nordlysradar laver et langt, tilfældigt kanalnavn.
4. Tryk **Kopiér kanal**, og tilføj denne kanal i ntfy via **Subscribe**. Giv ntfy lov til at sende notifikationer.
5. Tryk **Kopiér GitHub-hemmelighed**.
6. I dit GitHub-repository: **Settings → Secrets and variables → Actions → New repository secret**. Sæt navn til præcis `NORDLYS_ALERT_CONFIG`, indsæt den kopierede JSON som værdi, og gem.
7. Gå til **Actions → Personlige nordlysalarmer → Run workflow**. Sæt flueben ved **Send en test-push til min iPhone**. Kør, og kontrollér at en testbesked kommer frem.
8. Fjern afkrydsningen igen, når du vil starte en almindelig manuel kontrol. De planlagte checks kører derefter cirka **hvert 15. minut**.

**Et baggrundsvarsel kan udløses ved:**

- Gode lokale observationsforhold **nu** (Kp/nordlysaktivitet, tilstrækkeligt mørke og acceptable skyer).
- Et lovende observationsvindue i de kommende **seks timer**.
- En kraftig **NOAA Kp-prognose** (som udgangspunkt G3/Kp 7, justerbar) i de kommende **48 timer**.

Alarmer har separate tidsbegrænsninger, samt en samlet beskyttelse mod gentagelser. Efter en tidlig meddelelse kan du få en senere, mere presserende besked, hvis forholdene bliver gode *nu*. Den vejledende observationsscore er ikke en statistisk sandsynlighed.

**Når du ændrer placering, scoregrænse, lysforurening eller stilleperioder i appen**, skal du trykke **Kopiér GitHub-hemmelighed** igen og opdatere værdien af det eksisterende secret `NORDLYS_ALERT_CONFIG`. GitHub kan ikke læse indstillinger, du kun har gemt lokalt i browseren.

**Privatliv:** Den personlige placering og alarmkanal gemmes i GitHubs repository secret – **ikke** i dine offentligt hostede kildefiler. Beskeder formidles via tredjeparten ntfy.sh. En ntfy-kanal er ikke adgangskontrolleret på gratisudgaven; det lange tilfældige kanalnavn er dermed din adgangsnøgle. Del det ikke, og inkluder ikke følsomme oplysninger i kanalens navn. Den lokale backupfil indeholder også kanalnavnet.

**Pålidelighed:** GitHub Actions-schedule er ikke et realtidsvarsel; planlagte job kan blive forsinkede eller pausede af GitHub. Push fra ntfy kræver net og at du har tilladt notifikationer på iPhone. Brug ikke denne app til sikkerhedskritiske varsler.

## 4. iPhone-widget – aktiveres med Scriptable

Widgetfilen ligger i ZIP'en som `widget/Nordlysradar.js` og kan også hentes fra appen under **Indstillinger → iPhone-widget**.

1. Installer den gratis app **Scriptable** fra App Store: https://apps.apple.com/app/scriptable/id1405459188
2. Opret i Scriptable et nyt script kaldet **Nordlysradar**. Kopiér hele indholdet af `widget/Nordlysradar.js` ind i scriptet, eller importér filen fra Filer-appens delingsmenu.
3. På iPhone-hjemmeskærmen: tryk et tomt sted længe → **Rediger / Tilføj widget** → vælg **Scriptable** og en lille eller mellemstor widget.
4. Hold fingeren på widgetten → **Rediger widget** → **Script: Nordlysradar**.
5. Åbn Nordlysradar-webappen og vælg **Indstillinger → iPhone-widget → Kopiér min widget-placering**. Indsæt denne værdi i **Parameter** på Scriptable-widgetten.
6. Widgetten viser observationsindeks, Kp, skydække og månebelysning. Tryk på den for at åbne Nordlysradar.

**Særlige forhold:** Widgetten henter data selv fra din offentliggjorte webapp og Open-Meteo. Den behøver ikke ntfy. Hvis dit GitHub Pages-site har en anden adresse end `https://mikkelfamme.github.io/nordlysradar/`, skal du ændre `APP_URL` øverst i widgetfilen, før du kopierer den ind i Scriptable. iOS bestemmer, hvornår widgetten faktisk opdateres; en foreslået 30-minutters opdatering er ingen garanti. En PWA kan ikke i sig selv installere en native WidgetKit-widget.

## Fejlfinding

| Problem | Kontrol |
| --- | --- |
| Kort er mørkt uden baggrund | Internetadgang og OpenStreetMap-tiles. Tjek eventuelt OSM-drift og netværksbegrænsninger. |
| Ingen farvet nordlyszone | NOAA OVATION-data mangler, er ældre end to timer eller har ingen aktiv intensitet. |
| Ingen push | Bekræft ntfy-abonnement, tillad notifikationer, tjek GitHub-secret og test-kørslen under Actions. |
| GitHub-action kan ikke gemme alarmstatus | Kontrollér `Settings → Actions → General → Workflow permissions` og `contents: write`. |
| Push efter justering bruger gamle værdier | Kopiér og opdatér GitHub-secret igen. |
| Widget viser 'Afventer friske data' | Sørg for at webappens GitHub Pages-URL er rigtig, `data/space-weather.json` er opdateret, og widgetparameteren indeholder koordinater. |
| Widget opdaterer langsomt | iOS prioriterer opdateringsfrekvens efter strømforbrug, brugeradfærd og systembegrænsninger. |
| Test-push kommer ikke | Åbn workflowets logs – testen kræver et gyldigt `NORDLYS_ALERT_CONFIG` og internetadgang til ntfy.sh. |

## Tests

```bash
npm test
python3 -m unittest discover -s tests -p 'test_noaa_script.py' -v
```

De automatiske tests bruger syntetiske data. NOAA, Open-Meteo, OpenStreetMap, Scriptable og ntfy skal testes via den faktiske GitHub Pages-installation på din telefon.
