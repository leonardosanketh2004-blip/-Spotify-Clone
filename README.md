# Spotify Clone

Prototipo web stile Spotify (React + Vite).

Funzioni: Home, ricerca, libreria con playlist (crea/rinomina/elimina, aggiungi/rimuovi brani), "Brani che ti piacciono", player con play/pausa, avanti/indietro, casuale, ripeti (tutti/uno), barra di avanzamento e volume. Playlist, like e volume sono salvati in `localStorage`. Barra spaziatrice = play/pausa.

Brani demo: SoundHelix (royalty-free). Copertine: picsum.photos.

```bash
npm install
npm run dev
```

## Catalogo Spotify ufficiale (serve Spotify Premium)

1. Su https://developer.spotify.com/dashboard crea un'app con **Web API** e **Web Playback SDK**.
2. Aggiungi i Redirect URI:
   - `https://leonardosanketh2004-blip.github.io/-Spotify-Clone/`
   - `http://127.0.0.1:5173/`
3. Copia il **Client ID** (il Client Secret non serve: il login usa OAuth PKCE).
4. In locale aggiungi a `.env.local`: `VITE_SPOTIFY_CLIENT_ID=il_tuo_client_id` e apri http://127.0.0.1:5173/.
5. Per il sito online aggiungi il secret GitHub Actions `SPOTIFY_CLIENT_ID`.

In modalità sviluppo Spotify consente l'accesso solo agli utenti aggiunti in **User Management** nella dashboard.
Senza login Spotify l'app usa Jamendo.

## Musica vera con Jamendo

1. Crea un'app gratuita su https://devportal.jamendo.com e copia il **Client ID**.
2. Crea il file `.env.local` nella root del progetto:
   ```
   VITE_JAMENDO_CLIENT_ID=il_tuo_client_id
   ```
3. Riavvia `npm run dev`.

Senza Client ID l'app usa i brani demo.

## Pubblicazione (GitHub Pages)

Ogni push su `main` pubblica l'app tramite `.github/workflows/deploy.yml`. Richiede:
- Settings → Pages → Source: **GitHub Actions**
- Settings → Secrets and variables → Actions → secret `JAMENDO_CLIENT_ID`
