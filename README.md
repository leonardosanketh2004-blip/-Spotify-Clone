# Spotify Clone

Prototipo web stile Spotify (React + Vite).

Funzioni: Home, ricerca, libreria con playlist (crea/rinomina/elimina, aggiungi/rimuovi brani), "Brani che ti piacciono", player con play/pausa, avanti/indietro, casuale, ripeti (tutti/uno), barra di avanzamento e volume. Playlist, like e volume sono salvati in `localStorage`. Barra spaziatrice = play/pausa.

Brani demo: SoundHelix (royalty-free). Copertine: picsum.photos.

```bash
npm install
npm run dev
```

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
