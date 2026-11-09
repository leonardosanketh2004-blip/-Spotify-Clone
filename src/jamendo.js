const CLIENT_ID = import.meta.env.VITE_JAMENDO_CLIENT_ID;
const BASE = 'https://api.jamendo.com/v3.0';

export const jamendoEnabled = Boolean(CLIENT_ID);

export const genres = [
  { tag: 'pop', name: 'Pop', color: '#dc148c' },
  { tag: 'rock', name: 'Rock', color: '#e61e32' },
  { tag: 'electronic', name: 'Elettronica', color: '#0d73ec' },
  { tag: 'hiphop', name: 'Hip Hop', color: '#ba5d07' },
  { tag: 'jazz', name: 'Jazz', color: '#8d67ab' },
  { tag: 'lounge', name: 'Chill', color: '#148a08' },
  { tag: 'classical', name: 'Classica', color: '#7d4b32' },
  { tag: 'indie', name: 'Indie', color: '#e8115b' },
];

// The Jamendo API intermittently returns an empty result set for valid queries, so retry a few times.
async function api(path, params = {}, attempts = 4) {
  const qs = new URLSearchParams({ client_id: CLIENT_ID, format: 'json', ...params });
  for (let i = 1; ; i++) {
    const res = await fetch(`${BASE}/${path}/?${qs}`);
    const data = await res.json();
    if (data.headers?.status !== 'success') throw new Error(data.headers?.error_message || 'Errore Jamendo');
    if (data.results.length || i >= attempts) return data.results;
    await new Promise((r) => setTimeout(r, 250 * i));
  }
}

const toTrack = (t) => ({
  id: `j${t.id}`,
  title: t.name,
  artist: t.artist_name,
  album: t.album_name,
  albumId: t.album_id,
  cover: t.album_image || t.image,
  src: t.audio,
  duration: t.duration,
});

const toAlbum = (a) => ({
  id: a.id,
  name: a.name,
  description: a.artist_name,
  cover: a.image,
});

const trackParams = { limit: 30, imagesize: 300, audioformat: 'mp32' };

export const popularTracks = (limit = 30) =>
  api('tracks', { ...trackParams, limit, order: 'popularity_week' }).then((r) => r.map(toTrack));

export const searchTracks = (q) =>
  api('tracks', { ...trackParams, search: q, order: 'relevance' }).then((r) => r.map(toTrack));

export const tagTracks = (tag) =>
  api('tracks', { ...trackParams, tags: tag, order: 'popularity_month' }).then((r) => r.map(toTrack));

export const albumTracks = (albumId) =>
  api('tracks', { ...trackParams, album_id: albumId, order: 'releasedate' }).then((r) => r.map(toTrack));

export const popularAlbums = (limit = 12) =>
  api('albums', { limit, imagesize: 300, order: 'popularity_week' }).then((r) => r.map(toAlbum));
