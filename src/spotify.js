const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const API = 'https://api.spotify.com/v1';
const SCOPES = [
  'streaming', 'user-read-email', 'user-read-private',
  'user-read-playback-state', 'user-modify-playback-state',
  'user-library-read', 'user-library-modify',
  'user-top-read', 'user-read-recently-played',
  'playlist-read-private', 'playlist-read-collaborative',
].join(' ');

export const spotifyEnabled = Boolean(CLIENT_ID);

const redirectUri = () => `${window.location.origin}${import.meta.env.BASE_URL}`;
const store = {
  get: () => JSON.parse(localStorage.getItem('sp-token') || 'null'),
  set: (t) => localStorage.setItem('sp-token', JSON.stringify(t)),
  clear: () => localStorage.removeItem('sp-token'),
};

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function login() {
  // Spotify only accepts loopback IPs (not "localhost") as http redirect URIs.
  if (window.location.hostname === 'localhost') {
    window.location.href = window.location.href.replace('localhost', '127.0.0.1');
    return;
  }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  localStorage.setItem('sp-verifier', verifier);
  const qs = new URLSearchParams({
    client_id: CLIENT_ID, response_type: 'code', redirect_uri: redirectUri(), scope: SCOPES,
    code_challenge_method: 'S256', code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${qs}`;
}

export function logout() { store.clear(); }

async function tokenRequest(params) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Login Spotify fallito');
  const prev = store.get();
  const token = {
    access: data.access_token,
    refresh: data.refresh_token || prev?.refresh,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  };
  store.set(token);
  return token;
}

/** Completes the OAuth redirect if present. Returns true when a session exists. */
export async function handleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (params.get('error') || code) window.history.replaceState({}, '', redirectUri());
  if (params.get('error')) throw new Error(`Login Spotify annullato (${params.get('error')})`);
  if (code) {
    await tokenRequest({
      grant_type: 'authorization_code', code, redirect_uri: redirectUri(),
      code_verifier: localStorage.getItem('sp-verifier'),
    });
    localStorage.removeItem('sp-verifier');
  }
  return Boolean(store.get());
}

export async function getToken() {
  const t = store.get();
  if (!t) throw new Error('Non hai effettuato l\'accesso a Spotify');
  if (Date.now() < t.expires) return t.access;
  try {
    return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh })).access;
  } catch (e) {
    store.clear();
    throw e;
  }
}

async function api(path, { method = 'GET', body, query } = {}) {
  const url = new URL(path.startsWith('http') ? path : `${API}${path}`);
  if (query) Object.entries(query).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, v));
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await getToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Errore Spotify (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const img = (images, size = 300) => {
  if (!images?.length) return '';
  return [...images].sort((a, b) => Math.abs((a.width || size) - size) - Math.abs((b.width || size) - size))[0].url;
};

export const toTrack = (t, album = t.album) => ({
  id: `s${t.id}`,
  uri: t.uri,
  title: t.name,
  artist: t.artists.map((a) => a.name).join(', '),
  artistId: t.artists[0]?.id || t.artists[0]?.uri?.split(':').pop(),
  album: album?.name,
  albumId: album?.id || album?.uri?.split(':').pop(),
  cover: img(album?.images),
  duration: (t.duration_ms || 0) / 1000,
});

export const toAlbum = (a) => ({
  id: a.id, name: a.name, description: a.artists?.map((x) => x.name).join(', '), cover: img(a.images), uri: a.uri,
});
export const toArtist = (a) => ({ id: a.id, name: a.name, description: 'Artista', cover: img(a.images), uri: a.uri, round: true });
export const toPlaylist = (p) => ({
  id: `sp-${p.id}`, spotifyId: p.id, name: p.name, description: p.owner?.display_name ? `Di ${p.owner.display_name}` : 'Playlist',
  cover: img(p.images), uri: p.uri, total: p.tracks?.total ?? p.items?.total, spotify: true,
});

const tracksOf = (items) => items.map((i) => i?.track || i?.item || i).filter((t) => t && t.id && t.type !== 'episode').map((t) => toTrack(t));

export const me = () => api('/me');
export const topTracks = () => api('/me/top/tracks', { query: { limit: 20, time_range: 'short_term' } }).then((d) => tracksOf(d.items));
export const recentTracks = () => api('/me/player/recently-played', { query: { limit: 30 } })
  .then((d) => {
    const seen = new Set();
    return tracksOf(d.items).filter((t) => !seen.has(t.id) && seen.add(t.id));
  });
export const savedTracks = () => api('/me/tracks', { query: { limit: 50 } }).then((d) => tracksOf(d.items));
export const myPlaylists = () => api('/me/playlists', { query: { limit: 50 } }).then((d) => d.items.filter(Boolean).map(toPlaylist));
export const newReleases = () => api('/browse/new-releases', { query: { limit: 12 } }).then((d) => d.albums.items.map(toAlbum));

export async function search(q, type = 'track,artist,album') {
  const d = await api('/search', { query: { q, type, limit: 20 } });
  return {
    tracks: tracksOf(d.tracks?.items || []),
    artists: (d.artists?.items || []).filter(Boolean).map(toArtist),
    albums: (d.albums?.items || []).filter(Boolean).map(toAlbum),
  };
}

export async function album(id) {
  const a = await api(`/albums/${id}`);
  return { ...toAlbum(a), tracks: a.tracks.items.map((t) => toTrack(t, a)) };
}

export async function artist(id) {
  const [a, top, albums] = await Promise.allSettled([
    api(`/artists/${id}`),
    api(`/artists/${id}/top-tracks`),
    api(`/artists/${id}/albums`, { query: { include_groups: 'album,single', limit: 20 } }),
  ]);
  if (a.status === 'rejected') throw a.reason;
  return {
    ...toArtist(a.value),
    followers: a.value.followers?.total,
    tracks: top.status === 'fulfilled' ? tracksOf(top.value.tracks) : [],
    albums: albums.status === 'fulfilled' ? albums.value.items.map(toAlbum) : [],
  };
}

export async function playlistTracks(id) {
  try {
    return tracksOf((await api(`/playlists/${id}/items`, { query: { limit: 100 } })).items);
  } catch (e) {
    if (e.status !== 404 && e.status !== 403) throw e;
    return tracksOf((await api(`/playlists/${id}/tracks`, { query: { limit: 100 } })).items);
  }
}

const rawId = (id) => id.replace(/^s/, '');
export const containsSaved = (ids) => api('/me/tracks/contains', { query: { ids: ids.map(rawId).join(',') } });
export const saveTrack = (id) => api('/me/tracks', { method: 'PUT', query: { ids: rawId(id) } });
export const unsaveTrack = (id) => api('/me/tracks', { method: 'DELETE', query: { ids: rawId(id) } });

export const play = (deviceId, uris, position = 0) =>
  api('/me/player/play', { method: 'PUT', query: { device_id: deviceId }, body: { uris, offset: { position } } });
export const setShuffle = (deviceId, state) => api('/me/player/shuffle', { method: 'PUT', query: { device_id: deviceId, state } });
export const setRepeat = (deviceId, state) => api('/me/player/repeat', { method: 'PUT', query: { device_id: deviceId, state } });

/** Loads the Web Playback SDK and creates a player that shows up as a Spotify Connect device. */
export function createPlayer(name, onState, onReady, onError) {
  return new Promise((resolve) => {
    const init = () => {
      const player = new window.Spotify.Player({ name, getOAuthToken: (cb) => getToken().then(cb).catch(onError), volume: 0.7 });
      player.addListener('ready', ({ device_id }) => onReady(device_id));
      player.addListener('player_state_changed', onState);
      player.addListener('initialization_error', ({ message }) => onError(new Error(message)));
      player.addListener('authentication_error', ({ message }) => onError(new Error(`Autenticazione Spotify: ${message}`)));
      player.addListener('account_error', () => onError(new Error('Per ascoltare i brani interi serve un account Spotify Premium.')));
      player.addListener('playback_error', ({ message }) => onError(new Error(message)));
      player.connect();
      resolve(player);
    };
    if (window.Spotify) return init();
    window.onSpotifyWebPlaybackSDKReady = init;
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    document.head.appendChild(s);
  });
}
