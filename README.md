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

**Detect Board** blijft een eenvoudige cirkelzoeker en is geen volledige kalibratie. De eerdere Geometry/Wire/Hybrid-keuze is verwijderd omdat die geen verschillende algoritmes aanstuurde. Handmatige kalibratie gebruikt vier punten en perspectiefcorrectie; sterke lensvervorming wordt hiermee niet gecorrigeerd.
