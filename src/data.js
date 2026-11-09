const artists = ['Aurora Nights', 'Neon Drift', 'Luna Park', 'Echo Valley', 'The Midnight Owls', 'Solaris'];
const titles = [
  'Onde di Luce', 'Città di Notte', 'Respiro', 'Ultimo Treno', 'Sabbia e Vento', 'Eclissi',
  'Cuore Elettrico', 'Orizzonte', 'Pioggia d\'Estate', 'Frequenze', 'Vertigine', 'Ritorno',
  'Satellite', 'Nebbia', 'Polvere di Stelle', 'Alba',
];

export const tracks = titles.map((title, i) => ({
  id: `t${i + 1}`,
  title,
  artist: artists[i % artists.length],
  album: `Album ${Math.floor(i / 4) + 1}`,
  cover: `https://picsum.photos/seed/cover${Math.floor(i / 4) + 1}/300/300`,
  src: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${i + 1}.mp3`,
}));

export const defaultPlaylists = [
  { id: 'p1', name: 'Hit del momento', description: 'I brani più ascoltati di oggi.', cover: 'https://picsum.photos/seed/pl1/300/300', trackIds: ['t1', 't3', 't5', 't7', 't9', 't11'] },
  { id: 'p2', name: 'Chill Vibes', description: 'Rilassati con questi brani tranquilli.', cover: 'https://picsum.photos/seed/pl2/300/300', trackIds: ['t2', 't4', 't6', 't14', 't16'] },
  { id: 'p3', name: 'Focus', description: 'Musica per concentrarsi.', cover: 'https://picsum.photos/seed/pl3/300/300', trackIds: ['t8', 't10', 't12', 't13'] },
  { id: 'p4', name: 'Energia', description: 'Carica a mille per l\'allenamento.', cover: 'https://picsum.photos/seed/pl4/300/300', trackIds: ['t15', 't1', 't7', 't13', 't2'] },
];

export const albums = Array.from({ length: 4 }, (_, a) => ({
  id: `a${a + 1}`,
  name: `Album ${a + 1}`,
  description: artists[(a * 4) % artists.length],
  cover: `https://picsum.photos/seed/cover${a + 1}/300/300`,
  trackIds: tracks.slice(a * 4, a * 4 + 4).map((t) => t.id),
}));
