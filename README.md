# PELEAS ACOJONANTES

Prototip web/Android de joc de lluita 1 contra 1. Inclou client web, servidor WebSocket Node.js i workflow de GitHub Actions per compilar un APK de depuració.

## Executar el servidor

```bash
npm install
npm start
```

El servidor escolta el port `8080` per defecte. Per jugar des de dispositius externs cal desplegar-lo en un host públic amb WebSocket segur (`wss://`) i configurar aquesta URL en el joc quan la demani. El port local no és accessible per internet sense desplegament, túnel o configuració de xarxa.

## Crear l'APK amb GitHub Actions

1. Crea un repositori nou anomenat `PELEAS-ACOJONANTES` a GitHub.
2. Puja tot el contingut d'aquesta carpeta a la branca `main`.
3. Obre **Actions → Build Android APK** i executa el workflow (o espera que s'executi en fer push).
4. En acabar, descarrega l'artefacte `PELEAS-ACOJONANTES-debug-apk` de la pàgina de l'execució. Descomprimeix-lo i instal·la `app-debug.apk` en Android.

## Estat honest

Aquesta és una base inicial, no un joc final. El servidor i el client estan implementats a nivell de prototip, però el servidor encara no està desplegat públicament i no s'ha verificat una partida des de dues xarxes diferents. El workflow compila un APK debug, no un APK signat de publicació. Cal configurar i provar un servidor públic abans que el multijugador funcioni entre dispositius per internet.
