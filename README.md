# DartVision

Een basis met OpenCV-bordherkenning en handmatige beeldopnames voor nieuwe dartproeven.

## Code-overzicht

De bestandsnamen geven aan welk onderdeel ze uitvoeren. De bordherkenning staat los van de minimale darttest. Begin voor nieuwe proeven bij `js/dart-test-controller.js`.

| Bestand | Verantwoordelijkheid |
| --- | --- |
| [`index.html`](index.html) | Knoppen, camerabeeld, tekenlagen en scorepaneel. |
| [`css/app.css`](css/app.css) | Vormgeving en de schermindeling voor telefoon en pc. |
| [`js/app.js`](js/app.js) | Start de applicatie en verbindt camera, bordherkenning en darttest. |
| [`js/camera-stream.js`](js/camera-stream.js) | Opent de camera en vraagt de gewenste beeldkwaliteit aan. |
| [`js/opencv-runtime.js`](js/opencv-runtime.js) | Wacht op OpenCV en legt gedeelde cameraframes vast. |
| [`js/board-detection.js`](js/board-detection.js) | Automatische bordherkenning via de dubbel- en triple-ring. |
| [`js/board-calibration.js`](js/board-calibration.js) | Kalibratie, borduitlijning en omzetting van beeldpositie naar bordcoördinaten. |
| [`js/dart-test-controller.js`](js/dart-test-controller.js) | Regelt de drie testknoppen en bewaart de beelden vóór en na een worp. |
| [`scripts/start-dev-server.mjs`](scripts/start-dev-server.mjs) | Lokale HTTPS-server en ontwikkelcertificaten. |
| `tests/*.test.mjs` | Tests met dezelfde onderdeelnamen als de bronbestanden. |

`start-local.cmd` blijft de Windows-startknop. `package.json` bevat de start- en buildcommando's. `dist/` is gegenereerde uitvoer; pas de bronbestanden aan en maak daarna een nieuwe build.

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

## Nieuwe basis voor dartproeven

1. Start de camera en herken of kalibreer het bord.
2. Kies **Test dart herkennen** om de eenvoudige testmodus te openen.
3. Kies **Leeg bord vastleggen**. Het huidige camerabeeld wordt als vaste referentie bewaard.
4. Gooi of prik een pijl, haal je hand weg en kies **Ik heb een pijl gegooid**. Er wordt een tweede beeld vastgelegd.

De camera blijft live. Twee kleine voorbeelden tonen het lege bord en het beeld na de worp. Opnieuw een worp vastleggen vervangt alleen het tweede beeld; de referentie blijft hetzelfde. Een nieuwe lege-bordopname wist het vorige worpbeeld. Stoppen, opnieuw kalibreren of de pagina herladen wist beide beelden. Er worden geen bestanden gedownload of naar een server gestuurd.

De oude dartdetectie, bewegingsdetectie, schacht-/puntanalyse, scoreberekening en replayfunctie zijn verwijderd. Er wordt nog niet automatisch bepaald of er een dart in beeld is. De drie knoppen vormen de basis om toekomstige technieken afzonderlijk te testen.

Alle bediening en beeldopname staat in `js/dart-test-controller.js`. De teruggegeven `getFrames()` geeft `{ reference, afterThrow }` als `ImageData` voor een volgende proef. OpenCV blijft beschikbaar voor de bestaande bordherkenning; de nieuwe testmodus gebruikt alleen de camerabeelden.

Controles: `node --test tests/*.test.mjs` en `npm run build`.
