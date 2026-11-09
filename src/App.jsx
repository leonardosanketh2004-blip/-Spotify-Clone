import { useEffect, useMemo, useRef, useState } from 'react';
import { tracks, defaultPlaylists, albums } from './data';
import { jamendoEnabled, genres, popularTracks, popularAlbums, searchTracks, tagTracks, albumTracks } from './jamendo';
import * as SP from './spotify';
import * as Ic from './Icons';
import './App.css';

const demoById = Object.fromEntries(tracks.map((t) => [t.id, t]));
const fmt = (s) => (isFinite(s) && s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
const SP_REPEAT = { off: 'off', all: 'context', one: 'track' };

function useStored(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  useEffect(() => localStorage.setItem(key, JSON.stringify(v)), [key, v]);
  return [v, setV];
}

export default function App() {
  const audio = useRef(null);
  const failures = useRef(0);
  const spPlayer = useRef(null);
  const toggleRef = useRef(null);
  const [view, setView] = useState({ type: 'home' });
  const [playlists, setPlaylists] = useStored('sc-playlists', defaultPlaylists);
  const [liked, setLiked] = useStored('sc-liked', []);
  const [queue, setQueue] = useState(tracks.map((t) => t.id));
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useStored('sc-volume', 0.7);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(null);
  const [known, setKnown] = useStored('sc-tracks', {});
  const [popular, setPopular] = useState(jamendoEnabled ? [] : tracks.map((t) => t.id));
  const [homeAlbums, setHomeAlbums] = useState(jamendoEnabled ? [] : albums);
  const [results, setResults] = useState(jamendoEnabled ? [] : tracks.map((t) => t.id));
  const [searchExtra, setSearchExtra] = useState({ artists: [], albums: [] });
  const [remote, setRemote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Spotify
  const [sp, setSp] = useState(false);
  const [spUser, setSpUser] = useState(null);
  const [device, setDevice] = useState(null);
  const [spCurrent, setSpCurrent] = useState(null);
  const [spLiked, setSpLiked] = useState([]);
  const [spHome, setSpHome] = useState({ top: [], recent: [], releases: [], playlists: [] });

  const byId = useMemo(() => ({ ...demoById, ...known }), [known]);
  const current = sp ? byId[spCurrent] : byId[queue[index]];
  const likedIds = sp ? spLiked : liked;
  const localPlaylists = sp ? playlists.filter((p) => p.custom) : playlists;
  const showGenres = sp || jamendoEnabled;

  const remember = (list) => {
    setKnown((k) => ({ ...k, ...Object.fromEntries(list.map((t) => [t.id, t])) }));
    return list.map((t) => t.id);
  };
  const fail = (e) => setError(e.message);

  useEffect(() => {
    if (!SP.spotifyEnabled) return;
    SP.handleRedirect().then(setSp).catch(fail);
  }, []);

  useEffect(() => {
    if (!jamendoEnabled) return;
    popularTracks().then((list) => {
      const ids = remember(list);
      setPopular(ids);
      setQueue((q) => (q.every((id) => demoById[id]) ? ids : q));
    }).catch(fail);
    popularAlbums().then(setHomeAlbums).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sp) return;
    setPlaying(false);
    SP.me().then(setSpUser).catch(fail);
    SP.topTracks().then((l) => setSpHome((h) => ({ ...h, top: remember(l) }))).catch(fail);
    SP.recentTracks().then((l) => setSpHome((h) => ({ ...h, recent: remember(l) }))).catch(fail);
    SP.newReleases().then((l) => setSpHome((h) => ({ ...h, releases: l }))).catch(fail);
    SP.myPlaylists().then((l) => setSpHome((h) => ({ ...h, playlists: l }))).catch(fail);
    SP.savedTracks().then((l) => setSpLiked(remember(l))).catch(fail);
    let cancelled = false;
    const onState = (state) => {
      if (!state) return;
      const t = state.track_window.current_track;
      if (t) { remember([SP.toTrack(t)]); setSpCurrent(`s${t.id}`); }
      setPlaying(!state.paused);
      setTime(state.position / 1000);
      setDuration(state.duration / 1000);
      setShuffle(state.shuffle);
      setRepeat(['off', 'all', 'one'][state.repeat_mode] || 'off');
    };
    SP.createPlayer('Spotify Clone', onState, setDevice, fail).then((p) => {
      if (cancelled) p.disconnect(); else spPlayer.current = p;
    });
    return () => { cancelled = true; spPlayer.current?.disconnect(); spPlayer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  useEffect(() => {
    if (!sp || !playing) return;
    const timer = setInterval(() => setTime((t) => Math.min(t + 0.5, duration)), 500);
    return () => clearInterval(timer);
  }, [sp, playing, duration]);

  useEffect(() => {
    if (sp) {
      if (!query.trim()) { setResults(spHome.top); setSearchExtra({ artists: [], albums: [] }); return; }
      setLoading(true);
      const timer = setTimeout(() => {
        SP.search(query.trim()).then((r) => { setResults(remember(r.tracks)); setSearchExtra({ artists: r.artists, albums: r.albums }); })
          .catch(fail).finally(() => setLoading(false));
      }, 400);
      return () => clearTimeout(timer);
    }
    if (!jamendoEnabled) {
      setResults(tracks.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(query.toLowerCase())).map((t) => t.id));
      return;
    }
    if (!query.trim()) { setResults(popular); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      searchTracks(query.trim()).then((list) => setResults(remember(list))).catch(fail).finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, popular, sp, spHome.top]);

  useEffect(() => {
    const isRemote = ['tag', 'splaylist', 'artist'].includes(view.type) || (view.type === 'album' && (sp || jamendoEnabled));
    if (!isRemote) { setRemote(null); return; }
    const genre = genres.find((g) => g.tag === view.tag);
    const base = {
      tag: { id: `tag-${view.tag}`, name: genre?.name ?? view.tag, description: `I brani ${genre?.name ?? view.tag} più ascoltati`, color: genre?.color },
      album: { id: `album-${view.id}`, name: view.name, description: view.description, cover: view.cover },
      artist: { id: `artist-${view.id}`, name: view.name, description: 'Artista', cover: view.cover, round: true },
      splaylist: { id: view.id, name: view.name, description: view.description, cover: view.cover },
    }[view.type];
    setRemote({ ...base, trackIds: [], loading: true });
    let extra = null;
    const keep = (x) => { extra = x; return x.tracks; };
    const load = sp
      ? { tag: () => SP.search(`genre:"${view.tag}"`, 'track').then((r) => r.tracks),
          album: () => SP.album(view.id).then(keep),
          artist: () => SP.artist(view.id).then(keep),
          splaylist: () => SP.playlistTracks(view.spotifyId) }[view.type]()
      : view.type === 'tag' ? tagTracks(view.tag) : albumTracks(view.id);
    let cancelled = false;
    load.then((list) => {
      if (cancelled) return;
      const more = extra ? {
        name: extra.name, cover: extra.cover || base.cover, albums: extra.albums,
        description: extra.followers !== undefined ? `${extra.followers.toLocaleString('it-IT')} follower` : extra.description,
      } : {};
      setRemote({ ...base, ...more, trackIds: remember(list) });
    }).catch((e) => { if (!cancelled) { fail(e); setRemote({ ...base, trackIds: [] }); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sp]);

  useEffect(() => {
    if (sp) spPlayer.current?.setVolume(muted ? 0 : volume);
    else audio.current.volume = muted ? 0 : volume;
  }, [volume, muted, sp, device]);
  useEffect(() => {
    if (sp) return;
    if (playing) audio.current.play().catch(() => (audio.current.error ? skipBroken() : setPlaying(false)));
    else audio.current.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, current, sp]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); toggleRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { document.title = current && playing ? `${current.title} • ${current.artist}` : 'Spotify Clone'; }, [current, playing]);
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const togglePlay = () => {
    if (!sp) { setPlaying((p) => !p); return; }
    if (!spCurrent) { playList(queue.filter((id) => byId[id]?.uri).length ? queue : spHome.top); return; }
    spPlayer.current?.togglePlay();
  };
  toggleRef.current = togglePlay;

  const playList = (ids, start = 0) => {
    if (!ids.length) return;
    if (sp) {
      if (!device) { setError('Il player Spotify non è ancora pronto. Riprova tra qualche secondo.'); return; }
      if (spCurrent === ids[start]) { spPlayer.current?.togglePlay(); return; }
      spPlayer.current?.activateElement();
      let playable = ids.filter((id) => byId[id]?.uri);
      let pos = Math.max(0, playable.indexOf(ids[start]));
      if (playable.length > 100) { playable = playable.slice(pos, pos + 100); pos = 0; }
      if (!playable.length) { setError('Questi brani non sono disponibili su Spotify.'); return; }
      setQueue(ids);
      SP.play(device, playable.map((id) => byId[id].uri), pos).catch(fail);
      return;
    }
    if (queue === ids && index === start) { setPlaying((p) => !p); return; }
    setQueue(ids); setIndex(start); setTime(0); setPlaying(true);
  };
  const next = (auto = false) => {
    if (sp) { spPlayer.current?.nextTrack(); return; }
    if (auto && repeat === 'one') { audio.current.currentTime = 0; audio.current.play(); return; }
    let n = shuffle ? Math.floor(Math.random() * queue.length) : index + 1;
    if (n >= queue.length) { if (repeat === 'all' || !auto) n = 0; else { setPlaying(false); return; } }
    setIndex(n); setTime(0);
  };
  const skipBroken = () => {
    if (++failures.current < queue.length) next(); else setPlaying(false);
  };
  const prev = () => {
    if (sp) { spPlayer.current?.previousTrack(); return; }
    if (audio.current.currentTime > 3) { audio.current.currentTime = 0; return; }
    setIndex((i) => (i - 1 + queue.length) % queue.length); setTime(0);
  };
  const seek = (v) => {
    if (sp) spPlayer.current?.seek(v * 1000); else audio.current.currentTime = v;
    setTime(v);
  };
  const toggleShuffle = () => {
    if (sp && device) SP.setShuffle(device, !shuffle).catch(fail);
    setShuffle(!shuffle);
  };
  const cycleRepeat = () => {
    const r = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
    if (sp && device) SP.setRepeat(device, SP_REPEAT[r]).catch(fail);
    setRepeat(r);
  };
  const toggleLike = (id) => {
    if (!sp) { setLiked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])); return; }
    if (!byId[id]?.uri) return;
    const has = spLiked.includes(id);
    setSpLiked((l) => (has ? l.filter((x) => x !== id) : [id, ...l]));
    (has ? SP.unsaveTrack(id) : SP.saveTrack(id)).catch((e) => {
      fail(e);
      setSpLiked((l) => (has ? [id, ...l] : l.filter((x) => x !== id)));
    });
  };
  const createPlaylist = () => {
    const p = { id: `p${Date.now()}`, name: `La mia playlist n. ${localPlaylists.length + 1}`, description: 'Playlist creata da te.', cover: `https://picsum.photos/seed/u${Date.now()}/300/300`, trackIds: [], custom: true };
    setPlaylists([...playlists, p]); setView({ type: 'playlist', id: p.id });
  };
  const addToPlaylist = (pid, tid) => setPlaylists((ps) => ps.map((p) => (p.id === pid && !p.trackIds.includes(tid) ? { ...p, trackIds: [...p.trackIds, tid] } : p)));
  const removeFromPlaylist = (pid, tid) => setPlaylists((ps) => ps.map((p) => (p.id === pid ? { ...p, trackIds: p.trackIds.filter((x) => x !== tid) } : p)));
  const renamePlaylist = (pid, name) => setPlaylists((ps) => ps.map((p) => (p.id === pid ? { ...p, name } : p)));
  const deletePlaylist = (pid) => { setPlaylists((ps) => ps.filter((p) => p.id !== pid)); setView({ type: 'home' }); };
  const openPlaylist = (p) => setView(p.spotify ? { type: 'splaylist', ...p } : { type: 'playlist', id: p.id });
  const playPlaylist = (p) => (p.spotify ? SP.playlistTracks(p.spotifyId).then((l) => playList(remember(l))).catch(fail) : playList(p.trackIds));
  const openAlbum = (a) => setView({ type: 'album', ...a });
  const playAlbum = (a) => (sp ? SP.album(a.id).then((x) => playList(remember(x.tracks))) : albumTracks(a.id).then((l) => playList(remember(l)))).catch(fail);
  const openArtist = (a) => setView({ type: 'artist', ...a });
  const playArtist = (a) => SP.artist(a.id).then((x) => playList(remember(x.tracks))).catch(fail);
  const logout = () => { SP.logout(); window.location.reload(); };

  const collection = useMemo(() => {
    if (view.type === 'playlist') return playlists.find((p) => p.id === view.id);
    if (view.type === 'album' && !sp && !jamendoEnabled) return albums.find((a) => a.id === view.id);
    if (view.type === 'liked') return { id: 'liked', name: 'Brani che ti piacciono', description: sp ? 'Dalla tua libreria Spotify' : 'I tuoi preferiti', trackIds: likedIds, liked: true };
    return remote;
  }, [view, playlists, likedIds, remote, sp]);

  const trackTable = (ids, playlistId) => (
    <div className="tracks">
      <div className="track head"><span>#</span><span>Titolo</span><span>Album</span><span /><span>Durata</span></div>
      {ids.map((id, i) => {
        const t = byId[id];
        if (!t) return null;
        const active = current?.id === id;
        const linkable = sp && t.uri;
        return (
          <div key={`${id}-${i}`} className={`track ${active ? 'active' : ''}`} onDoubleClick={() => playList(ids, i)}>
            <span className="num">
              <span className="n">{active && playing ? <span className="eq"><i /><i /><i /></span> : i + 1}</span>
              <button className="icon play-row" onClick={() => (active ? togglePlay() : playList(ids, i))}>{active && playing ? <Ic.Pause /> : <Ic.Play />}</button>
            </span>
            <span className="title-cell">
              <img src={t.cover} alt="" />
              <span><b>{t.title}</b>
                <small className={linkable ? 'link' : ''} onClick={() => linkable && t.artistId && openArtist({ id: t.artistId, name: t.artist.split(', ')[0] })}>{t.artist}</small>
              </span>
            </span>
            <span className={`muted ${linkable ? 'link' : ''}`} onClick={() => linkable && t.albumId && openAlbum({ id: t.albumId, name: t.album, cover: t.cover })}>{t.album}</span>
            <span className="row-actions">
              <button className={`icon ${likedIds.includes(id) ? 'liked' : ''}`} onClick={() => toggleLike(id)} title="Mi piace"><Ic.Heart filled={likedIds.includes(id)} /></button>
              <button className="icon" title="Aggiungi a playlist" onClick={(e) => { e.stopPropagation(); setMenu({ tid: id, x: e.clientX, y: e.clientY }); }}><Ic.Plus /></button>
              {playlistId && <button className="icon" title="Rimuovi" onClick={() => removeFromPlaylist(playlistId, id)}><Ic.Trash /></button>}
            </span>
            <span className="muted">{t.duration ? fmt(t.duration) : active ? fmt(duration) : '—'}</span>
          </div>
        );
      })}
      {!ids.length && <p className="muted empty">{loading || collection?.loading ? 'Caricamento…' : 'Nessun brano qui. Usa ＋ accanto a un brano per aggiungerlo.'}</p>}
    </div>
  );

  const card = (item, onOpen, onPlay) => (
    <div key={item.id} className="card" onClick={onOpen}>
      <div className="card-img">
        <img src={item.cover} alt="" className={item.round ? 'round' : ''} />
        <button className="fab" onClick={(e) => { e.stopPropagation(); onPlay ? onPlay() : playList(item.trackIds); }}><Ic.Play size={22} /></button>
      </div>
      <b>{item.name}</b>
      <small>{item.description}</small>
    </div>
  );
  const trackCards = (ids) => ids.slice(0, 12).map((id, i) => {
    const t = byId[id];
    return t && card({ id, name: t.title, description: t.artist, cover: t.cover }, () => playList(ids, i), () => playList(ids, i));
  });
  const genreGrid = (
    <div className="genres">{genres.map((g) => (
      <div key={g.tag} className="genre" style={{ background: g.color }} onClick={() => setView({ type: 'tag', tag: g.tag })}>{g.name}</div>
    ))}</div>
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const quickItems = sp ? spHome.playlists.slice(0, 6) : localPlaylists.slice(0, 6);
  const heroLabel = { album: 'Album', tag: 'Genere', artist: 'Artista', liked: 'Playlist' }[view.type] || 'Playlist';

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="panel">
          <div className="logo">♫ Spotify Clone</div>
          <button className={`nav ${view.type === 'home' ? 'on' : ''}`} onClick={() => setView({ type: 'home' })}><Ic.Home size={24} /> Home</button>
          <button className={`nav ${view.type === 'search' ? 'on' : ''}`} onClick={() => setView({ type: 'search' })}><Ic.Search size={24} /> Cerca</button>
        </div>
        <div className="panel grow">
          <div className="lib-head">
            <span className="nav"><Ic.Library size={24} /> La tua libreria</span>
            <button className="icon" title="Crea playlist" onClick={createPlaylist}><Ic.Plus size={20} /></button>
          </div>
          <div className="lib-list">
            <button className={`lib-item ${view.type === 'liked' ? 'on' : ''}`} onClick={() => setView({ type: 'liked' })}>
              <div className="liked-cover"><Ic.Heart filled size={18} /></div>
              <span><b>Brani che ti piacciono</b><small>Playlist • {likedIds.length} brani</small></span>
            </button>
            {[...localPlaylists, ...(sp ? spHome.playlists : [])].map((p) => (
              <button key={p.id} className={`lib-item ${view.id === p.id ? 'on' : ''}`} onClick={() => openPlaylist(p)}>
                {p.cover ? <img src={p.cover} alt="" /> : <div className="liked-cover"><Ic.Library size={18} /></div>}
                <span><b>{p.name}</b><small>Playlist • {p.spotify ? p.description : `${p.trackIds.length} brani`}</small></span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="main">
        {SP.spotifyEnabled && (
          <div className="topbar">
            {sp ? <>
              {spUser?.images?.[0] && <img className="avatar" src={spUser.images[0].url} alt="" />}
              <span className="user">{spUser?.display_name}</span>
              <button className="pill ghost" onClick={logout}>Esci</button>
            </> : <button className="pill" onClick={() => SP.login().catch(fail)}>Accedi con Spotify</button>}
          </div>
        )}
        {error && <p className="error banner" onClick={() => setError('')}>⚠ {error} <small>(clicca per chiudere)</small></p>}

        {view.type === 'home' && (
          <div className="page">
            <h1>{greeting}{sp && spUser ? `, ${spUser.display_name}` : ''}</h1>
            <div className="quick">
              {quickItems.map((p) => (
                <div key={p.id} className="quick-item" onClick={() => openPlaylist(p)}>
                  {p.cover ? <img src={p.cover} alt="" /> : <div className="liked-cover"><Ic.Library size={24} /></div>}<b>{p.name}</b>
                  <button className="fab sm" onClick={(e) => { e.stopPropagation(); playPlaylist(p); }}><Ic.Play size={18} /></button>
                </div>
              ))}
            </div>
            {sp ? <>
              {spHome.top.length > 0 && <><h2>I tuoi brani più ascoltati</h2><div className="grid">{trackCards(spHome.top)}</div></>}
              {spHome.recent.length > 0 && <><h2>Ascoltati di recente</h2><div className="grid">{trackCards(spHome.recent)}</div></>}
              <h2>Generi</h2>
              {genreGrid}
              {spHome.releases.length > 0 && <><h2>Nuove uscite</h2><div className="grid">{spHome.releases.map((a) => card(a, () => openAlbum(a), () => playAlbum(a)))}</div></>}
              {spHome.playlists.length > 0 && <><h2>Le tue playlist</h2><div className="grid">{spHome.playlists.map((p) => card(p, () => openPlaylist(p), () => playPlaylist(p)))}</div></>}
            </> : <>
              <h2>{jamendoEnabled ? 'Di tendenza questa settimana' : 'Brani demo'}</h2>
              <div className="grid">{trackCards(popular)}</div>
              {showGenres && <><h2>Generi</h2>{genreGrid}</>}
              <h2>Album popolari</h2>
              <div className="grid">{homeAlbums.map((a) => card(a, () => openAlbum(a), jamendoEnabled ? () => playAlbum(a) : undefined))}</div>
              <h2>Le tue playlist</h2>
              <div className="grid">{localPlaylists.map((p) => card(p, () => openPlaylist(p)))}</div>
            </>}
          </div>
        )}

        {view.type === 'search' && (
          <div className="page">
            <div className="search-box"><Ic.Search size={20} /><input autoFocus placeholder={sp ? 'Cerca brani, artisti o album' : 'Cosa vuoi ascoltare?'} value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            {!query && showGenres && <><h2>Sfoglia tutto</h2>{genreGrid}</>}
            <h2>{query ? 'Brani' : sp ? 'I tuoi brani più ascoltati' : jamendoEnabled ? 'Di tendenza' : 'Tutti i brani'}</h2>
            {trackTable(query && sp ? results.slice(0, 10) : results)}
            {query && searchExtra.artists.length > 0 && <><h2>Artisti</h2>
              <div className="grid">{searchExtra.artists.slice(0, 6).map((a) => card(a, () => openArtist(a), () => playArtist(a)))}</div></>}
            {query && searchExtra.albums.length > 0 && <><h2>Album</h2>
              <div className="grid">{searchExtra.albums.slice(0, 6).map((a) => card(a, () => openAlbum(a), () => playAlbum(a)))}</div></>}
          </div>
        )}

        {collection && (
          <div className="page collection">
            <header className="hero" style={collection.color ? { background: `linear-gradient(180deg, ${collection.color}, transparent)` } : undefined}>
              {collection.liked ? <div className="liked-cover big"><Ic.Heart filled size={80} /></div>
                : collection.cover ? <img src={collection.cover} alt="" className={collection.round ? 'round' : ''} />
                : <div className="liked-cover big" style={{ background: collection.color }}><Ic.Library size={80} /></div>}
              <div>
                <small>{heroLabel}</small>
                {collection.custom
                  ? <input className="title-input" value={collection.name} onChange={(e) => renamePlaylist(collection.id, e.target.value)} />
                  : <h1>{collection.name}</h1>}
                <p className="muted">{collection.description} • {collection.trackIds.length} brani</p>
              </div>
            </header>
            <div className="actions">
              <button className="fab big" onClick={() => playList(collection.trackIds)} disabled={!collection.trackIds.length}>
                {playing && collection.trackIds.includes(current?.id) ? <Ic.Pause size={28} /> : <Ic.Play size={28} />}
              </button>
              {collection.custom && <button className="icon" title="Elimina playlist" onClick={() => deletePlaylist(collection.id)}><Ic.Trash size={22} /></button>}
            </div>
            {view.type === 'artist' && <h2 className="tight">Popolari</h2>}
            {trackTable(collection.trackIds, collection.custom ? collection.id : null)}
            {collection.albums?.length > 0 && <><h2>Discografia</h2>
              <div className="grid">{collection.albums.map((a) => card(a, () => openAlbum(a), () => playAlbum(a)))}</div></>}
          </div>
        )}
      </main>

      <footer className="player">
        <div className="now">
          {current && <>
            <img src={current.cover} alt="" />
            <span><b>{current.title}</b>
              <small onClick={() => sp && current.artistId && openArtist({ id: current.artistId, name: current.artist.split(', ')[0] })}>{current.artist}</small>
            </span>
            <button className={`icon ${likedIds.includes(current.id) ? 'liked' : ''}`} onClick={() => toggleLike(current.id)}><Ic.Heart filled={likedIds.includes(current.id)} /></button>
          </>}
        </div>
        <div className="controls">
          <div className="buttons">
            <button className={`icon ${shuffle ? 'on' : ''}`} title="Casuale" onClick={toggleShuffle}><Ic.Shuffle /></button>
            <button className="icon" title="Precedente" onClick={prev}><Ic.Prev size={20} /></button>
            <button className="playbtn" title={playing ? 'Pausa' : 'Riproduci'} onClick={togglePlay}>{playing ? <Ic.Pause size={20} /> : <Ic.Play size={20} />}</button>
            <button className="icon" title="Successivo" onClick={() => next()}><Ic.Next size={20} /></button>
            <button className={`icon ${repeat !== 'off' ? 'on' : ''}`} title={`Ripeti: ${repeat}`} onClick={cycleRepeat}>
              <Ic.Repeat />{repeat === 'one' && <sup>1</sup>}
            </button>
          </div>
          <div className="progress">
            <small>{fmt(time)}</small>
            <input type="range" min={0} max={duration || 0} step={0.1} value={Math.min(time, duration || 0)}
              style={{ '--p': `${duration ? (time / duration) * 100 : 0}%` }}
              onChange={(e) => seek(+e.target.value)} />
            <small>{fmt(duration || current?.duration)}</small>
          </div>
        </div>
        <div className="volume">
          {sp && <span className="device" title="Riproduzione tramite Spotify">{device ? '● Spotify' : '○ Connessione…'}</span>}
          <button className="icon" onClick={() => setMuted(!muted)}><Ic.Volume muted={muted || volume === 0} /></button>
          <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume}
            style={{ '--p': `${(muted ? 0 : volume) * 100}%` }}
            onChange={(e) => { setVolume(+e.target.value); setMuted(false); }} />
        </div>
        <audio ref={audio} src={sp ? undefined : current?.src} preload="metadata"
          onTimeUpdate={(e) => !sp && setTime(e.target.currentTime)}
          onLoadStart={() => !sp && setDuration(0)}
          onLoadedMetadata={(e) => !sp && setDuration(e.target.duration)}
          onEnded={() => next(true)}
          onPlaying={() => { failures.current = 0; }}
          onError={() => !sp && playing && skipBroken()} />
      </footer>

      {menu && (
        <div className="menu" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 260) }} onClick={(e) => e.stopPropagation()}>
          <small>Aggiungi a playlist</small>
          {localPlaylists.map((p) => <button key={p.id} onClick={() => { addToPlaylist(p.id, menu.tid); setMenu(null); }}>{p.name}</button>)}
          {!localPlaylists.length && <button onClick={() => { createPlaylist(); setMenu(null); }}>＋ Crea una playlist</button>}
        </div>
      )}
    </div>
  );
}
