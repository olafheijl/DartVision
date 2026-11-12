# DartVision

Een dartteller met camerabeeld en OpenCV. De bestaande pagina en detectiewerking blijven gelijk.

## Starten op je pc

Installeer **Node.js 24 LTS** (inclusief npm). Open één terminal in deze map:

```sh
npm install
npm start
```

Op Windows kun je na het installeren van Node.js ook dubbelklikken op **`start-local.cmd`**. Dit installeert bij de eerste keer automatisch de dependencies en start daarna de server in één venster.

Open `https://localhost:5173`. Bij volgende keren is alleen `npm start` of dubbelklikken op `start-local.cmd` nodig.
Wijzigingen worden automatisch geladen. Stop met Ctrl+C. Geen Cloudflare, tunnel of tweede PowerShell nodig.

## Eenmalig HTTPS vertrouwen

De camera werkt op een telefoon alleen in een veilige HTTPS-context. `npm start` maakt daarom automatisch een eigen lokale certificaatautoriteit en certificaten in `.cert/`. Ze blijven bewaard; bij een gewijzigd lokaal IP-adres wordt het servercertificaat automatisch vernieuwd.

Vertrouw **alleen je eigen** `.cert/dartvision-ca.crt` op de apparaten waarmee je test. Dit geeft deze lokale certificaatautoriteit vertrouwen; houd `.cert/ca.key` privé. Deel nooit de map `.cert` of de sleutels. Verwijder het vertrouwen als je klaar bent met ontwikkelen. Als je `.cert` verwijdert of op een andere pc opnieuw genereert, moet je het nieuwe certificaat opnieuw vertrouwen.

- **Windows:** dubbelklik `.cert/dartvision-ca.crt` → Certificaat installeren → Huidige gebruiker → Alle certificaten in het onderstaande archief opslaan → Vertrouwde basiscertificeringsinstanties. Herstart je browser.
- **iPhone/iPad:** zet alleen `dartvision-ca.crt` via bijvoorbeeld AirDrop of een bestandsoverdracht op je telefoon, open het en installeer het profiel via Instellingen → Algemeen → VPN- en apparaatbeheer. Schakel vervolgens volledig vertrouwen in via Instellingen → Algemeen → Info → Vertrouwensinstellingen certificaten. Gebruik Safari.
- **Android:** zet alleen `dartvision-ca.crt` op je telefoon en installeer het als CA-certificaat via Instellingen → Beveiliging → Versleuteling en inloggegevens → Een certificaat installeren (namen verschillen per toestel). Gebruik Chrome.
- **macOS:** importeer het certificaat in Sleutelhangertoegang en stel vertrouwen voor dit certificaat in op Altijd vertrouwen.

Een certificaatwaarschuwing wegklikken is op telefoons niet altijd voldoende voor cameratoegang. Installeer en vertrouw het certificaat zoals hierboven.

## Testen op je telefoon

1. Verbind pc en telefoon met hetzelfde wifi-netwerk.
2. Start `npm start` op je pc; de terminal toont de mogelijke telefoonadressen, bijvoorbeeld `https://192.168.1.25:5173`.
3. Open het wifi-adres van je pc op de telefoon (niet `localhost`: dat verwijst naar de telefoon zelf).
4. Geef de browser cameratoestemming en druk op Start Camera.

Sta Node.js indien gevraagd toe in de Windows Firewall op **privénetwerken**. Gebruik geen gastnetwerk met apparaatisolatie. Kies het wifi-IP als VPN- of virtuele netwerkadapters meerdere adressen opleveren. Na wisselen van netwerk: herstart `npm start`. De ontwikkelserver is bereikbaar op het lokale netwerk zolang hij draait.

OpenCV wordt net als voorheen geladen vanaf `https://docs.opencv.org/4.x/opencv.js`; internet blijft daarvoor nodig.

## Productieversie / Cloudflare Pages

```sh
npm run build
```

Dit maakt **`dist/`** met de statische website. Upload de inhoud van deze map naar Cloudflare Pages, of stel bij Git-integratie in:

- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: 24
- Root directory: de repository-root

Cloudflare verzorgt daar HTTPS. Lokale certificaten en ontwikkelscripts komen niet in `dist`. Er is geen backend of Worker nodig. De build bevat verwijzingen naar de bestaande externe OpenCV-bibliotheek.

Met `npm run preview` kun je de build op je pc controleren; deze preview is HTTP en alleen lokaal bereikbaar. Gebruik `npm start` voor cameratests vanaf je telefoon.

`dist/`, `.cert/` en `node_modules/` worden lokaal gegenereerd en staan niet in Git. Voor een reproduceerbare installatie na het clonen kun je `npm ci` gebruiken.

## Bord handmatig kalibreren

Start de camera en kies **Kalibreer handmatig**. Het beeld wordt stilgezet. Tik vervolgens op de **buitenrand van de dubbelring** in deze volgorde: midden dubbel 20 (boven), midden dubbel 6 (rechts), midden dubbel 3 (onder), midden dubbel 11 (links). Gebruik niet de nummerring of de buitenkant van de surround.

Na het markeren hervat het livebeeld met een transparante laag: de bull en dubbel 20, 6, 3 en 11 zijn ingekleurd; hulplijnen tonen de triple-ring en buitenrand. De laag wordt met perspectiefcorrectie over het oorspronkelijke camerabeeld getekend. Met Toon/Verberg uitlijning kun je de laag vergelijken met het echte bord. Controleer de uitlijning en herhaal bij verkeerde punten. Met Annuleren kun je opnieuw beginnen. Houd de camera daarna vast op dezelfde plek. De uitlijning geldt voor de gekalibreerde camerapositie; er is nog geen automatische dartdetectie of koppeling van cameracoördinaten aan scores, en de kalibratie wordt niet bewaard na herladen.

**Detect Board** zoekt geen perfecte cirkels meer. OpenCV zoekt contouren van de rode/groene bordvlakken en past ellipsen op de ringen. Kandidaten moeten zowel op de dubbelring als triple-ring passen, verspreid over alle vier kwadranten. Een losse ovale nummerring of surround is niet voldoende. De ellips wordt ook gebruikt voor de uitlijningslaag en de omzetting van cameracoördinaten naar bordcoördinaten. Als de bull wordt herkend, helpt die de perspectiefcorrectie; zonder bull is dit een ellipsbenadering. Bij onvoldoende kleurinformatie of meerdere gelijkwaardige borden wordt detectie geweigerd.

Plaats de camera vast aan de zijkant en houd het hele speelvlak zichtbaar. Zorg voor voldoende verlichting. Zeer smalle kijkhoeken, occlusie en sterke lensvervorming blijven lastig; kies bij afwijkingen de handmatige vierpuntskalibratie. De automatische methode leest geen cijfers en neemt de richting van 20 bovenaan aan. Controleer daarom altijd of D20, D6, D3 en D11 kloppen. Handmatig markeren bepaalt ook deze richting. Een nieuw mislukte detectie wist de vorige uitlijning.

## Eén echte dart herkennen (experimenteel)

1. Zet de camera vast. Start de camera, kalibreer het bord en controleer de bestaande uitlijning.
2. Kies **Test dart herkennen**. Camera, score en knoppen passen op één telefoonscherm.
3. Maak het bord leeg en kies **Leeg bord vastleggen**. Haal je hand weg. Na minstens twee seconden neemt de app drie rustige, verschillende videobeelden en maakt daarvan een mediaanreferentie.
4. Prik **één dart** in het bord, haal je hand uit beeld en druk op **Herken dart**.
5. De app verzamelt drie rustige beelden en meet de dart in ieder beeld afzonderlijk. De resultaten moeten binnen 3 mm van elkaar liggen volgens de kalibratie en hetzelfde scorevak aanwijzen. Anders verschijnt een melding in plaats van een score.
6. Het middelste meetbeeld wordt stilgezet met de uitlijning. Verwijder de dart voor een volgende poging en druk opnieuw op Herken dart. Na cameraverplaatsing: opnieuw kalibreren en een nieuwe referentie vastleggen.

### Uitlijning beoordelen

- **Geel kader:** samengevoegde delen van het mogelijke dartobject.
- **Blauwe dwarsstreepjes:** de smalle doorsneden die de schachtlijn bepalen.
- **Grijze dwarsstreepjes:** bredere stukken die buiten de lijnberekening vallen, zoals de flight.
- **Groene lijn:** de geschatte schachtas.
- **Oranje lijnstuk:** de extra zoekactie naar een zwak zichtbare punt voorbij de sterke contour.
- **Roze kruisje:** de geschatte insteekpositie.
- **Oranje cirkels bij twijfel:** puntkandidaten die tussen de beelden niet overeenkwamen.

Onder de score staan het aantal gekoppelde fragmenten, gebruikte smalle doorsneden en de overeenstemming tussen de drie beelden. De kleuren laten zien wat is gemeten; ze zijn geen bevestiging dat de positie juist is. Dicht bij een draad wordt geen zekere score getoond.

### Wat de nieuwe methode doet

De bordherkenning en kalibratie blijven ongewijzigd. Alleen de dartmeting is vervangen. Na belichtingscompensatie en correctie van kleine beeldverschuivingen zoekt de app veranderingen op grijswaardenbeelden. Sterke delen geven een kandidaat; zwakkere delen kunnen daarbij aansluiten. Losse delen worden alleen gekoppeld als ze voldoende in elkaars verlengde liggen. De dart hoeft dus niet één verbonden vlek te zijn.

De meetkern verdeelt de dart langs verschillende mogelijke assen in dwarsdoorsneden. Hij sluit brede delen uit en past met OpenCV `fitLine`/Huber een robuuste lijn door de smalle delen. OpenCV Canny/Hough geeft mogelijke richtingen; de grootte en het midden van de flight bepalen de uiteindelijke lijn niet. Een lokale zoekactie langs de lijn verfijnt het zwakke uiteinde. Elk van de drie beelden doorloopt deze meting onafhankelijk.

Het ontwerp is geïnspireerd op de smalle-schachtbenadering beschreven in [OpenDarts Ares](https://github.com/richiela/opendarts/blob/main/opendarts/engines/ares/detection.py) en de kenmerkpunt-/lijnbenadering van [OpenCV Steel Darts](https://github.com/hanneshoettinger/opencv-steel-darts/blob/master/DartsRecognition.py). De JavaScript-meetkern is een eigen implementatie. OpenDarts gebruikt meerdere camera's; de prestaties van dat volledige systeem gelden niet automatisch voor deze app met één camera.

### Een meting bewaren

Met **Bewaar meting** download je lokaal een JSON-bestand met het referentiebeeld, de drie meetbeelden als PNG, hun afzonderlijke resultaten, het gecombineerde resultaat en de kalibratie van de beeldhoeken. Ook een mislukte herkenning kan worden bewaard. Er worden geen beelden naar een server gestuurd. Het bestand bevat camerabeelden; deel alleen opnames die je wilt delen.

Dit bestand maakt een mislukte meting reproduceerbaar voor verdere ontwikkeling. De app heeft nog geen importscherm voor opgeslagen metingen. Er worden geen worpen of wedstrijdscores geregistreerd.

### Grenzen van deze testversie

Een volledig verborgen insteekpositie kan één camera niet betrouwbaar bepalen. Schaduwen, reflecties, overlappingen en donkere darts tegen donkere vakken kunnen nog steeds fouten of ontbrekende metingen geven. Gebruik een vaste camera, voldoende gelijkmatig licht en een kijkhoek waarin punt en schacht zichtbaar zijn. De camera wordt bij het starten om 1920×1080 als voorkeur gevraagd; apparaten mogen een andere resolutie leveren. Metingen gebruiken maximaal 1280 pixels langs de langste beeldzijde. Het werkelijke meetformaat staat onder de score en wordt opgeslagen in de meting. Kleine beeldregistratiecorrecties vervangen opnieuw kalibreren na echte cameraverplaatsing niet.

De regressietests gebruiken onder andere donkere en onderbroken punten, verschillende richtingen en resoluties, brede flights, handen, losse fragmenten en wisselende puntposities. Ze bewijzen geen nauwkeurigheid op alle echte borden. Bewaarde echte metingen blijven nodig om die nauwkeurigheid te bepalen.

Ontwikkelcontroles: `node --test tests/*.test.mjs` en `npm run build`.


### Verbeteringen op echte metingen

De vergelijking kan nu kleine rotatie-, schaal- en scheefheidsverschillen corrigeren met OpenCV ECC. Alleen begrensde transformaties die het achtergrondverschil verkleinen worden gebruikt; anders blijft de eenvoudige verschuivingscorrectie beschikbaar. De geregistreerde positie wordt voor de score terugvertaald naar het referentiebeeld. De bestaande bordherkenning en score-indeling zijn niet aangepast.

Voor de dartselectie telt ook duidelijke nieuwe beeldinformatie aan de flightzijde mee. Dat helpt bestaande borddraden en schaduwen afwijzen. De punt wordt daarna gezocht als een smalle, scherpe verandering tegenover beide directe zijkanten, in plaats van als het laatste veranderde pixel. Een brede, zachte schaduw mag de punt niet voorbij de echte dart trekken. Wanneer de zichtbare punt bij een overgang naar een donker vlak ophoudt, kan de meting bewust zonder score eindigen.

Deze verbeteringen zijn op drie lokaal aangeleverde exports nagekeken: twee reeksen krijgen drie overeenkomende punten; een donkere reeks houdt één onzekere punt en krijgt geen score. Dat is een kleine regressieset, geen algemene nauwkeurigheidsmeting. De foto's en exports staan niet in Git.

### Opgeslagen metingen opnieuw testen

Voor ontwikkelaars is er `scripts/replay-measurements.py`. Dit draait dezelfde JavaScript-detector met echte OpenCV.js in headless Chromium, reconstrueert de opgeslagen kalibratie en rapporteert overeenstemming en score. Het vereist apart Python Playwright en Chromium; de website heeft die niet nodig. Het script gebruikt een lokaal OpenCV.js-bestand met ingebedde WASM en maakt geen netwerkverbindingen.

```sh
python scripts/replay-measurements.py meting1.json meting2.json --opencv-js opencv.js --output resultaat.json
```

Met `--chromium` kun je een bestaand Chromium-programma aanwijzen. Met `--expected verwachtingen.json` kun je private regressie-eisen toevoegen: een JSON-object met per bestandsnaam `agreement`, `accepted` en optioneel `point_bounds` als `[links, boven, rechts, onder]` in beeldpixels. Scores zijn detectoruitvoer; bevestig de echte scorevakken apart. Bewaar camerabeelden en persoonlijke exports buiten de repository.
