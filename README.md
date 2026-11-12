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

1. Zet de camera vast, met constante verlichting. Kies een licht schuine kijkhoek waarbij punt, schacht en flight zichtbaar zijn. Kalibreer het bord en controleer de uitlijning.
2. Kies **Test dart herkennen**. Camera en score passen op één telefoonscherm.
3. Zorg dat het bord leeg is en kies **Leeg bord vastleggen**. Haal je hand weg: de app wacht minstens twee seconden en vervolgens op een rustig beeld.
4. Prik **één dart** in het bord, haal je hand volledig uit beeld en druk op **Herken dart**. De app wacht op een rustig beeld en voert één meting uit. OpenCV Canny en HoughLinesP zoeken rechte randen van het nieuwe object; fitLine schat een gezamenlijke schachtlijn. Vorminformatie helpt de richting naar de punt te onderscheiden van de flight. De score verschijnt als **Schatting**, waarna het gemeten beeld wordt stilgezet. Druk opnieuw op Herken dart voor een nieuwe meting.
5. Verwijder de dart voor de volgende poging; iedere meting vergelijkt met hetzelfde lege bord. Bij verandering van camera of belichting: opnieuw kalibreren en een nieuw leeg referentiebeeld maken.

Geen blauwe markering nodig. Deze versie combineert beeldverschil, vormanalyse en OpenCV-lijndetectie, geen getraind AI-model. Een algemene helderheidsverschuiving wordt eerst gecompenseerd. Beweging, grote veranderingen, meerdere losse objecten en een onduidelijke punt leiden tot een melding in plaats van een score. Bij een positie vlak bij een draad wordt geen zekere score gegeven. Er worden geen wedstrijdscores opgeslagen.

**Beperking:** de echte insteekpositie kan met één camera niet betrouwbaar worden bepaald als de punt achter de barrel/flight verborgen zit. Schaduwen, reflecties, automatische belichting en donkere darts tegen donkere vakken kunnen ook verkeerde of ontbrekende detecties geven. De smalste zichtbare contour is een schatting van de punt, geen bewezen insteekpositie. Controleer het kruisje en de score altijd op het echte bord. Sterke perspectiefvervorming vraagt handmatige kalibratie; de automatische kalibratie herkent de bordrotatie niet uit de cijfers.


### Uitlijning van de dart controleren

Na **Herken dart** zie je een stilstaand camerabeeld met:

- **Geel kader:** het gevonden langwerpige veranderde object.
- **Blauwe lijnen:** kandidaat-randen die ongeveer in de schachtrichting lopen.
- **Groene lijn:** de geschatte schachtas, wanneer voldoende passende lijnen zijn gevonden.
- **Roze kruisje:** het geschatte uiteinde van de punt. Dit kruisje bepaalt de geschatte score.

Als alleen randen zichtbaar zijn maar punt en flight niet te onderscheiden zijn, verschijnen de randen met een uitleg en geen score. Een onzichtbare insteekpositie kan deze methode niet reconstrueren. Controleer of de groene lijn echt over de schacht loopt en of het roze kruisje bij het bord ligt. De uitlijning is meetinformatie, geen automatische bevestiging van juistheid. Met Herken dart of Leeg bord vastleggen keer je terug naar livebeeld voor een volgende meting.

### Donkere barrel en metalen punt

Dartmetingen gebruiken nu tot 1280 pixels langs de langste beeldzijde (zonder kleinere camerabeelden op te schalen). De vergelijking corrigeert kleine beeldverschuivingen en een algemene helderheidsverandering. Na het vinden van de schacht zoekt de app in een smalle strook verder naar zwakkere veranderingen van de donkere punt. Dat deel wordt **oranje** getekend; het roze kruisje staat op het laatst ondersteunde uiteinde. De zoekactie stopt bij een aanhoudende onderbreking en verzint geen insteekpositie achter een verborgen punt. Kleine uitlijncorrecties zijn voor de beeldvergelijking; na echte cameraverplaatsing blijft opnieuw kalibreren nodig.

De gevoeligere detectie kan ook lokale schaduwen en reflecties meenemen. Controleer daarom de uitlijning. De tests omvatten opgebouwde donkere-puntbeelden en OpenCV-browsertests; dit is geen garantie voor herkenning onder alle lichtomstandigheden.
