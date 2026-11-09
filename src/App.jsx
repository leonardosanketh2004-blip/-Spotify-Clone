import { useEffect, useMemo, useRef, useState } from 'react';
import { tracks, defaultPlaylists, albums } from './data';
import { jamendoEnabled, genres, popularTracks, popularAlbums, searchTracks, tagTracks, albumTracks } from './jamendo';
import * as Ic from './Icons';
import './App.css';

const demoById = Object.fromEntries(tracks.map((t) => [t.id, t]));
const fmt = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

function useStored(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  useEffect(() => localStorage.setItem(key, JSON.stringify(v)), [key, v]);
  return [v, setV];
}

export default function App() {
  const audio = useRef(null);
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
  const [remote, setRemote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const byId = useMemo(() => ({ ...demoById, ...known }), [known]);
  const current = byId[queue[index]];

  const remember = (list) => {
    setKnown((k) => ({ ...k, ...Object.fromEntries(list.map((t) => [t.id, t])) }));
    return list.map((t) => t.id);
  };

  useEffect(() => {
    if (!jamendoEnabled) return;
    popularTracks().then((list) => {
      const ids = remember(list);
      setPopular(ids);
      setQueue((q) => (q.every((id) => demoById[id]) ? ids : q));
    }).catch((e) => setError(e.message));
    popularAlbums().then(setHomeAlbums).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!jamendoEnabled) {
      setResults(tracks.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(query.toLowerCase())).map((t) => t.id));
      return;
    }
    if (!query.trim()) { setResults(popular); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      searchTracks(query.trim()).then((list) => setResults(remember(list))).catch((e) => setError(e.message)).finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, popular]);

  useEffect(() => {
    if (!(view.type === 'tag' || (view.type === 'album' && jamendoEnabled))) { setRemote(null); return; }
    const genre = genres.find((g) => g.tag === view.tag);
    const base = view.type === 'tag'
      ? { id: `tag-${view.tag}`, name: genre?.name ?? view.tag, description: `I brani ${genre?.name ?? view.tag} più ascoltati del mese`, color: genre?.color }
      : { id: `album-${view.id}`, name: view.name, description: view.description, cover: view.cover, album: true };
    setRemote({ ...base, trackIds: [], loading: true });
    const load = view.type === 'tag' ? tagTracks(view.tag) : albumTracks(view.id);
    let cancelled = false;
    load.then((list) => { if (!cancelled) setRemote({ ...base, trackIds: remember(list) }); })
      .catch((e) => { if (!cancelled) { setError(e.message); setRemote({ ...base, trackIds: [] }); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => { audio.current.volume = muted ? 0 : volume; }, [volume, muted]);
  useEffect(() => {
    if (playing) audio.current.play().catch(() => setPlaying(false));
    else audio.current.pause();
  }, [playing, current]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); setPlaying((p) => !p); }
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

  const playList = (ids, start = 0) => {
    if (!ids.length) return;
    if (queue === ids && index === start) { setPlaying((p) => !p); return; }
    setQueue(ids); setIndex(start); setTime(0); setPlaying(true);
  };
  const next = (auto = false) => {
    if (auto && repeat === 'one') { audio.current.currentTime = 0; audio.current.play(); return; }
    let n = shuffle ? Math.floor(Math.random() * queue.length) : index + 1;
    if (n >= queue.length) { if (repeat === 'all' || !auto) n = 0; else { setPlaying(false); return; } }
    setIndex(n); setTime(0);
  };
  const prev = () => {
    if (audio.current.currentTime > 3) { audio.current.currentTime = 0; return; }
    setIndex((i) => (i - 1 + queue.length) % queue.length); setTime(0);
  };
  const toggleLike = (id) => setLiked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const createPlaylist = () => {
    const p = { id: `p${Date.now()}`, name: `La mia playlist n. ${playlists.length + 1}`, description: 'Playlist creata da te.', cover: `https://picsum.photos/seed/u${Date.now()}/300/300`, trackIds: [], custom: true };
    setPlaylists([...playlists, p]); setView({ type: 'playlist', id: p.id });
  };
  const addToPlaylist = (pid, tid) => setPlaylists((ps) => ps.map((p) => (p.id === pid && !p.trackIds.includes(tid) ? { ...p, trackIds: [...p.trackIds, tid] } : p)));
  const removeFromPlaylist = (pid, tid) => setPlaylists((ps) => ps.map((p) => (p.id === pid ? { ...p, trackIds: p.trackIds.filter((x) => x !== tid) } : p)));
  const renamePlaylist = (pid, name) => setPlaylists((ps) => ps.map((p) => (p.id === pid ? { ...p, name } : p)));
  const deletePlaylist = (pid) => { setPlaylists((ps) => ps.filter((p) => p.id !== pid)); setView({ type: 'home' }); };

  const collection = useMemo(() => {
    if (view.type === 'playlist') return playlists.find((p) => p.id === view.id);
    if (view.type === 'album' && !jamendoEnabled) return albums.find((a) => a.id === view.id);
    if (view.type === 'liked') return { id: 'liked', name: 'Brani che ti piacciono', description: `${liked.length} brani`, trackIds: liked, liked: true };
    return remote;
  }, [view, playlists, liked, remote]);

  const trackTable = (ids, playlistId) => (
    <div className="tracks">
      <div className="track head"><span>#</span><span>Titolo</span><span>Album</span><span /><span>Durata</span></div>
      {ids.map((id, i) => {
        const t = byId[id];
        const active = current?.id === id;
        return (
          <div key={id} className={`track ${active ? 'active' : ''}`} onDoubleClick={() => playList(ids, i)}>
            <span className="num">
              <span className="n">{active && playing ? <span className="eq"><i /><i /><i /></span> : i + 1}</span>
              <button className="icon play-row" onClick={() => (active ? setPlaying(!playing) : playList(ids, i))}>{active && playing ? <Ic.Pause /> : <Ic.Play />}</button>
            </span>
            <span className="title-cell">
              <img src={t.cover} alt="" />
              <span><b>{t.title}</b><small>{t.artist}</small></span>
            </span>
            <span className="muted">{t.album}</span>
            <span className="row-actions">
              <button className={`icon ${liked.includes(id) ? 'liked' : ''}`} onClick={() => toggleLike(id)} title="Mi piace"><Ic.Heart filled={liked.includes(id)} /></button>
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
        <img src={item.cover} alt="" />
        <button className="fab" onClick={(e) => { e.stopPropagation(); onPlay ? onPlay() : playList(item.trackIds); }}><Ic.Play size={22} /></button>
      </div>
      <b>{item.name}</b>
      <small>{item.description}</small>
    </div>
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';

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
              <span><b>Brani che ti piacciono</b><small>Playlist • {liked.length} brani</small></span>
            </button>
            {playlists.map((p) => (
              <button key={p.id} className={`lib-item ${view.id === p.id ? 'on' : ''}`} onClick={() => setView({ type: 'playlist', id: p.id })}>
                <img src={p.cover} alt="" />
                <span><b>{p.name}</b><small>Playlist • {p.trackIds.length} brani</small></span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="main">
        {view.type === 'home' && (
          <div className="page">
            <h1>{greeting}</h1>
            <div className="quick">
              {playlists.slice(0, 6).map((p) => (
                <div key={p.id} className="quick-item" onClick={() => setView({ type: 'playlist', id: p.id })}>
                  <img src={p.cover} alt="" /><b>{p.name}</b>
                  <button className="fab sm" onClick={(e) => { e.stopPropagation(); playList(p.trackIds); }}><Ic.Play size={18} /></button>
                </div>
              ))}
            </div>
            {error && <p className="error">⚠ {error}</p>}
            <h2>{jamendoEnabled ? 'Di tendenza questa settimana' : 'Brani demo'}</h2>
            <div className="grid">{popular.slice(0, 12).map((id, i) => {
              const t = byId[id];
              return card({ id, name: t.title, description: t.artist, cover: t.cover }, () => playList(popular, i), () => playList(popular, i));
            })}</div>
            {jamendoEnabled && <>
              <h2>Generi</h2>
              <div className="genres">{genres.map((g) => (
                <div key={g.tag} className="genre" style={{ background: g.color }} onClick={() => setView({ type: 'tag', tag: g.tag })}>{g.name}</div>
              ))}</div>
            </>}
            <h2>Album popolari</h2>
            <div className="grid">{homeAlbums.map((a) => card(a, () => setView({ type: 'album', ...a }),
              jamendoEnabled ? () => albumTracks(a.id).then((list) => playList(remember(list))) : undefined))}</div>
            <h2>Le tue playlist</h2>
            <div className="grid">{playlists.map((p) => card(p, () => setView({ type: 'playlist', id: p.id })))}</div>
          </div>
        )}

        {view.type === 'search' && (
          <div className="page">
            <div className="search-box"><Ic.Search size={20} /><input autoFocus placeholder="Cosa vuoi ascoltare?" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            {!query && jamendoEnabled && <>
              <h2>Sfoglia tutto</h2>
              <div className="genres">{genres.map((g) => (
                <div key={g.tag} className="genre" style={{ background: g.color }} onClick={() => setView({ type: 'tag', tag: g.tag })}>{g.name}</div>
              ))}</div>
            </>}
            <h2>{query ? `Risultati per "${query}"` : jamendoEnabled ? 'Di tendenza' : 'Tutti i brani'}</h2>
            {trackTable(results)}
          </div>
        )}

        {collection && (
          <div className="page collection">
            <header className="hero" style={collection.color ? { background: `linear-gradient(180deg, ${collection.color}, transparent)` } : undefined}>
              {collection.liked ? <div className="liked-cover big"><Ic.Heart filled size={80} /></div>
                : collection.cover ? <img src={collection.cover} alt="" />
                : <div className="liked-cover big" style={{ background: collection.color }}><Ic.Library size={80} /></div>}
              <div>
                <small>{view.type === 'album' ? 'Album' : view.type === 'tag' ? 'Genere' : 'Playlist'}</small>
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
            {trackTable(collection.trackIds, collection.custom ? collection.id : null)}
          </div>
        )}
      </main>

      <footer className="player">
        <div className="now">
          {current && <>
            <img src={current.cover} alt="" />
            <span><b>{current.title}</b><small>{current.artist}</small></span>
            <button className={`icon ${liked.includes(current.id) ? 'liked' : ''}`} onClick={() => toggleLike(current.id)}><Ic.Heart filled={liked.includes(current.id)} /></button>
          </>}
        </div>
        <div className="controls">
          <div className="buttons">
            <button className={`icon ${shuffle ? 'on' : ''}`} title="Casuale" onClick={() => setShuffle(!shuffle)}><Ic.Shuffle /></button>
            <button className="icon" title="Precedente" onClick={prev}><Ic.Prev size={20} /></button>
            <button className="playbtn" title={playing ? 'Pausa' : 'Riproduci'} onClick={() => setPlaying(!playing)}>{playing ? <Ic.Pause size={20} /> : <Ic.Play size={20} />}</button>
            <button className="icon" title="Successivo" onClick={() => next()}><Ic.Next size={20} /></button>
            <button className={`icon ${repeat !== 'off' ? 'on' : ''}`} title={`Ripeti: ${repeat}`} onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}>
              <Ic.Repeat />{repeat === 'one' && <sup>1</sup>}
            </button>
          </div>
          <div className="progress">
            <small>{fmt(time)}</small>
            <input type="range" min={0} max={duration || 0} step={0.1} value={time}
              style={{ '--p': `${duration ? (time / duration) * 100 : 0}%` }}
              onChange={(e) => { audio.current.currentTime = +e.target.value; setTime(+e.target.value); }} />
            <small>{fmt(duration)}</small>
          </div>
        </div>
        <div className="volume">
          <button className="icon" onClick={() => setMuted(!muted)}><Ic.Volume muted={muted || volume === 0} /></button>
          <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume}
            style={{ '--p': `${(muted ? 0 : volume) * 100}%` }}
            onChange={(e) => { setVolume(+e.target.value); setMuted(false); }} />
        </div>
        <audio ref={audio} src={current?.src} preload="metadata"
          onTimeUpdate={(e) => setTime(e.target.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.target.duration)}
          onEnded={() => next(true)} />
      </footer>

      {menu && (
        <div className="menu" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 260) }} onClick={(e) => e.stopPropagation()}>
          <small>Aggiungi a playlist</small>
          {playlists.map((p) => <button key={p.id} onClick={() => { addToPlaylist(p.id, menu.tid); setMenu(null); }}>{p.name}</button>)}
        </div>
      )}
    </div>
  );
}
