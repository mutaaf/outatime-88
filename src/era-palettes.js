// One palette per era, shared by both renderers (ticket 0100): the 2D scenes paint their sky
// and ground from it, and the 3D view can match its fog, sky and light to the same world.
// Pure data; imported only by lazy chunks (src/scenes/*, src/render3d/*), never by main.js.
//
// sky: top → horizon gradient stops ([offset, colour] pairs allowed) · horizon: the glow at the
// horizon line · fog: the colour distance fades to · sun: key light / sun disc · ground: near →
// far ground stops · theme: what the era's world is, for both renderers to agree on.
export const ERA_PALETTES = {
  2026: {
    theme: 'neon night town square, rain-slick',
    sky: ['#04030c', '#100826', '#2d114d', [0.86, '#7c1d54'], '#ff6a2b'],
    horizon: '#ff6a2b', fog: '#7c1d54', sun: '#ff7b00',
    ground: ['#1a0d2c', '#0b0719', '#05040d'],
    weather: 'rain',
  },
  1985: {
    theme: '80s suburb and mall under a full moon',
    sky: ['#05031a', '#0b071e', '#1c0f3a', [0.9, '#2b1342'], '#4a1d4f'],
    horizon: '#4a1d4f', fog: '#2b1342', sun: '#f1f0ff',
    ground: ['#121a29', '#0c121e', '#070a12'],
    weather: null,
  },
  1885: {
    theme: 'Old West railroad canyon at sundown',
    sky: ['#2a0c05', '#5a1d0b', '#8f3b19', [0.88, '#d8752c'], '#f2b84b'],
    horizon: '#f2b84b', fog: '#d8752c', sun: '#ffe7a8',
    ground: ['#6b3416', '#4a230f', '#2e150b'],
    weather: 'dust',
  },
  2015: {
    theme: 'hover future skyway, rain on schedule',
    sky: ['#020617', '#040c24', '#082c52', [0.85, '#0e4f7a'], '#5fb4c9'],
    horizon: '#5fb4c9', fog: '#0e4f7a', sun: '#22b8cf',
    ground: ['#0d2236', '#081726', '#040b14'],
    weather: 'rain',
  },
  2088: {
    theme: 'cyber megacity over a light-trail grid',
    sky: ['#030014', '#060318', '#1f093d', [0.82, '#4c0f5c'], '#d63384'],
    horizon: '#d63384', fog: '#4c0f5c', sun: '#d63384',
    ground: ['#14072e', '#0c0521', '#05020f'],
    weather: 'rain',
  },
  1955: {
    theme: '1955 courthouse square, sunny Saturday',
    sky: ['#2e6f99', '#4f93b8', '#8fc4d6', [0.9, '#f6b7c8'], '#ffd59e'],
    horizon: '#ffd59e', fog: '#f6b7c8', sun: '#fffbea',
    ground: ['#6fb8a3', '#3f8a78', '#24584d'],
    weather: null,
  },
};
