// city.js — Port Palmshade, generated deterministically from a seed.
//
// buildCity lays out the intersection grid, assigns each of the 99 blocks a
// district and a use (buildings, park, plaza, parking), raises buildings with
// rooftop detail and storefront signs, names the places the story needs, and
// scatters the set dressing: beach props, docks piers and cranes, hangout
// spots where pedestrians gather, zebra crossings, parked-car bays and the
// collision rectangles everything else walks and drives against.

import {
  PITCH, STREET, STREET_HALF, GRID_COLS, GRID_ROWS, BLOCK,
  WATER_EDGE, SAND_EDGE, DISTRICTS,
} from './config.js';
import { RNG, hashString } from './random.js';

const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

const BUSINESS_NAMES = {
  palmline: ['HELADOS', 'BRISA CAFÉ', 'HOTEL CORALINA', 'SURF & SALT', 'CASA LOLA', 'THE PALM INN'],
  flats: ['FERRETERÍA SOL', 'LAVANDERÍA LUNA', 'PANADERÍA REYES', 'TALLER MOTO', 'FARMACIA VIDA'],
  palmera: ['CAFÉ DORADO', 'LIBRERÍA ANDINA', 'JOYERÍA PRADO', 'PASTELERÍA MIEL', 'GALERÍA NORTE'],
  neon: ['CLUB AZAHAR', 'NEON PALACE', 'BAR VÉRTIGO', 'CINEMA LUX', 'HOTEL ESPEJO', 'KARAOKE SOL'],
  mercado: ['BANCO PALMSHADE', 'MERCADO CENTRAL', 'PAWN SOL', 'OFICINAS TÁMESIS', 'ALMACÉN RUIZ'],
  azure: ['BOUTIQUE AZUR', 'SPA MAREA', 'VINO & CO', 'GALERÍA AZUL', 'HOTEL MIRAMAR'],
  docks: ['NAViera CORAL', 'ALMACÉN 9', 'PESCA DEL SUR', 'TALLER NAVAL', 'ADUANAS'],
  marina: ['YACHT CLUB', 'VELA CAFÉ', 'MARINA STORE', 'CAPITANÍA', 'OSTRAS & CO'],
};

// Which district owns a block (bi: 0..10 across, bj: 0..8 down).
function districtForBlock(bi, bj) {
  if (bi === 0) return 'palmline';
  if (bj >= 7 && bi <= 4) return 'docks';
  if (bi >= 9 && bj >= 6) return 'marina';
  if (bi >= 9 && bj <= 2) return 'azure';
  if (bi >= 4 && bi <= 6 && bj >= 3 && bj <= 5) return 'neon';
  if (bi <= 3 && bj <= 2) return 'flats';
  if (bi >= 2 && bi <= 5 && bj >= 2 && bj <= 5) return 'palmera';
  if (bi >= 7) return 'mercado';
  return 'palmera';
}

// The story's named places: block, the side its door faces, and its sign.
const PLACE_DEFS = [
  { id: 'garage', name: "SOL'S GARAGE", sub: 'PALMLINE SAFEHOUSE', bi: 0, bj: 4, side: 'W', color: '#e2543e' },
  { id: 'motel', name: 'MOTEL PALMERA', sub: 'POOL · VACANCY', bi: 0, bj: 6, side: 'W', color: '#37a6a0', pool: true },
  { id: 'cafe', name: 'CAFÉ DORADO', sub: 'OLD PALMERA', bi: 3, bj: 3, side: 'S', color: '#c98a2d' },
  { id: 'club', name: 'CLUB AZAHAR', sub: 'NEON MILE', bi: 5, bj: 4, side: 'N', color: '#b04df0' },
  { id: 'clinica', name: 'CLÍNICA REYES', sub: 'EMERGENCIAS', bi: 2, bj: 1, side: 'E', color: '#e8e8e8' },
  { id: 'docks', name: 'CORAL DOCKS', sub: 'PIER 9 OFFICE', bi: 2, bj: 7, side: 'W', color: '#7e868a' },
  { id: 'bank', name: 'BANCO PALMSHADE', sub: 'MERCADO', bi: 7, bj: 3, side: 'S', color: '#8c6d2f' },
  { id: 'pspd', name: 'PSPD HQ', sub: 'PALMSHADE PD', bi: 7, bj: 4, side: 'W', color: '#274b8f' },
  { id: 'yacht', name: 'YACHT CLUB', sub: 'PALMSHADE MARINA', bi: 9, bj: 6, side: 'W', color: '#2d6f8e' },
];

export function blockRect(bi, bj) {
  return {
    x: bi * PITCH + STREET_HALF,
    y: bj * PITCH + STREET_HALF,
    w: BLOCK,
    h: BLOCK,
  };
}

export function intersectionAt(i, j) {
  return { x: i * PITCH, y: j * PITCH, i, j };
}

// Raise the buildings of one block: 1, 2 or 4 footprints with roof detail.
function buildBuildings(block, layout, deco) {
  const inset = 17;
  const ix = block.x + inset;
  const iy = block.y + inset;
  const iw = block.w - inset * 2;
  const ih = block.h - inset * 2;
  const pattern = layout.pick(['single', 'single', 'pair-h', 'pair-v', 'quad']);
  const rects = [];
  if (pattern === 'single') rects.push({ x: ix, y: iy, w: iw, h: ih });
  if (pattern === 'pair-h') {
    const gap = 10;
    const w = (iw - gap) / 2;
    rects.push({ x: ix, y: iy, w, h: ih }, { x: ix + w + gap, y: iy, w, h: ih });
  }
  if (pattern === 'pair-v') {
    const gap = 10;
    const h = (ih - gap) / 2;
    rects.push({ x: ix, y: iy, w: iw, h }, { x: ix, y: iy + h + gap, w: iw, h });
  }
  if (pattern === 'quad') {
    const gap = 10;
    const w = (iw - gap) / 2;
    const h = (ih - gap) / 2;
    rects.push(
      { x: ix, y: iy, w, h }, { x: ix + w + gap, y: iy, w, h },
      { x: ix, y: iy + h + gap, w, h }, { x: ix + w + gap, y: iy + h + gap, w, h },
    );
  }
  const district = DISTRICT_BY_ID[block.district];
  const names = BUSINESS_NAMES[block.district].slice();
  return rects.map((r) => {
    const commercial = deco.chance(0.55);
    const building = {
      ...r,
      roof: deco.pick(district.roofs),
      shade: deco.range(-9, 9),
      dialect: deco.pick(['grid', 'ribbon', 'panes']),
      floors: deco.int(2, 6),
      commercial,
      sign: null,
      awning: null,
      deco: [],
    };
    if (commercial && names.length) {
      building.sign = { text: deco.take(names), color: deco.pick(['#e2543e', '#37a6a0', '#f2a03d', '#b04df0', '#274b8f', '#c98a2d']) };
      building.awning = deco.pick(['#c4452f', '#2d7f7a', '#31597f', '#7a4a8c', '#b57e2c']);
    }
    // Rooftop clutter: vents, huts, solar panels, gardens, a billboard.
    const clutter = deco.int(1, 3);
    for (let k = 0; k < clutter; k++) {
      building.deco.push({
        kind: deco.pick(['vent', 'hut', 'solar', 'garden', 'tank']),
        x: r.x + deco.range(8, Math.max(9, r.w - 26)),
        y: r.y + deco.range(8, Math.max(9, r.h - 26)),
        w: deco.range(12, 24),
        h: deco.range(10, 18),
      });
    }
    if (commercial && deco.chance(0.4)) {
      building.deco.push({ kind: 'billboard', x: r.x + r.w / 2 - 20, y: r.y + 8, w: 40, h: 13, color: building.sign ? building.sign.color : '#e2543e' });
    }
    return building;
  });
}

export function buildCity(seed = 1) {
  const layout = new RNG(seed * 7919 + 13);
  const deco = new RNG(seed * 104729 + 7);
  const city = {
    seed,
    blocks: [],
    buildings: [],
    colliders: [],
    places: {},
    hangouts: [],
    crossings: [],
    parkedSpots: [],
    beachProps: [],
    piers: [],
    trees: [],
    lamps: [],
  };

  // Blocks and their contents.
  for (let bj = 0; bj < GRID_ROWS - 1; bj++) {
    for (let bi = 0; bi < GRID_COLS - 1; bi++) {
      const rect = blockRect(bi, bj);
      const district = districtForBlock(bi, bj);
      const block = { bi, bj, ...rect, district, kind: 'buildings', buildings: [], place: null };
      const roll = layout.float();
      if (district === 'marina' && bi === 9 && bj === 7) block.kind = 'plaza';
      else if (district === 'mercado' && bi === 8 && bj === 4) block.kind = 'plaza';
      else if (roll < 0.1) block.kind = 'park';
      else if (roll < 0.16) block.kind = 'parking';
      if (block.kind === 'buildings') {
        block.buildings = buildBuildings(block, layout, deco);
        for (const b of block.buildings) {
          city.buildings.push(b);
          city.colliders.push({ x: b.x, y: b.y, w: b.w, h: b.h });
        }
      }
      if (block.kind === 'park') {
        const trees = layout.int(5, 9);
        for (let t = 0; t < trees; t++) {
          city.trees.push({ x: rect.x + layout.range(20, rect.w - 20), y: rect.y + layout.range(20, rect.h - 20), r: layout.range(10, 16) });
        }
        for (let s = 0; s < 3; s++) {
          city.hangouts.push({ x: rect.x + layout.range(30, rect.w - 30), y: rect.y + layout.range(30, rect.h - 30), kind: 'bench' });
        }
      }
      if (block.kind === 'plaza') {
        if (district === 'marina') {
          const fountain = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, r: 26 };
          block.fountain = fountain;
          city.colliders.push({ x: fountain.x - 24, y: fountain.y - 24, w: 48, h: 48 });
          for (let s = 0; s < 6; s++) {
            const a = (s / 6) * Math.PI * 2;
            city.hangouts.push({ x: fountain.x + Math.cos(a) * 44, y: fountain.y + Math.sin(a) * 44, kind: 'plaza' });
          }
        } else {
          for (let s = 0; s < 5; s++) {
            city.hangouts.push({ x: rect.x + layout.range(24, rect.w - 24), y: rect.y + layout.range(24, rect.h - 24), kind: 'stall' });
          }
        }
      }
      city.blocks.push(block);
    }
  }

  // Named places sit on their blocks, doors on the forecourt sidewalk.
  for (const def of PLACE_DEFS) {
    const block = city.blocks.find((b) => b.bi === def.bi && b.bj === def.bj);
    block.kind = 'buildings';
    block.place = def.id;
    const main = {
      x: block.x + 26, y: block.y + 26, w: block.w - 52, h: block.h - 52,
      roof: '#ddd3ba', shade: 0, dialect: 'panes', floors: 3, commercial: true,
      sign: { text: def.name, color: def.color }, awning: def.color, deco: [], place: def.id,
    };
    if (def.pool) main.w = block.w - 118; // the pool takes the east side
    block.buildings = [main];
    city.buildings.push(main);
    city.colliders.push({ x: main.x, y: main.y, w: main.w, h: main.h });
    let door;
    const cx = block.x + block.w / 2;
    const cy = block.y + block.h / 2;
    if (def.side === 'W') door = { x: block.x + 7, y: cy };
    if (def.side === 'E') door = { x: block.x + block.w - 7, y: cy };
    if (def.side === 'N') door = { x: cx, y: block.y + 7 };
    if (def.side === 'S') door = { x: cx, y: block.y + block.h - 7 };
    const place = { ...def, x: door.x, y: door.y, block, signColor: def.color };
    city.places[def.id] = place;
    if (def.pool) {
      const pool = { x: block.x + block.w - 82, y: block.y + 34, w: 56, h: block.h - 68 };
      block.pool = pool;
      city.colliders.push({ ...pool });
      for (let s = 0; s < 3; s++) city.hangouts.push({ x: pool.x - 12, y: pool.y + 16 + s * 34, kind: 'pool' });
    }
    if (def.id === 'cafe' || def.id === 'yacht') {
      for (let s = 0; s < 3; s++) {
        city.hangouts.push({ x: door.x + (s - 1) * 22, y: door.y + (def.side === 'S' ? 12 : 0) + (def.side === 'W' ? (s - 1) * 22 : 0), kind: 'cafe' });
      }
    }
    if (def.id === 'club') {
      for (let s = 0; s < 3; s++) city.hangouts.push({ x: door.x + (s - 1) * 20, y: door.y - 12, kind: 'club' });
    }
  }

  // Café tables in front of ordinary storefronts, too.
  for (const b of city.buildings) {
    if (b.commercial && deco.chance(0.3)) {
      city.hangouts.push({ x: b.x + b.w / 2, y: b.y + b.h + 9, kind: 'cafe' });
    }
  }

  // Beach: umbrellas, towels, lifeguard stands, a volleyball net.
  for (let k = 0; k < 26; k++) {
    city.beachProps.push({
      kind: deco.pick(['umbrella', 'umbrella', 'towel', 'towel', 'ball']),
      x: deco.range(WATER_EDGE + 26, SAND_EDGE - 16),
      y: deco.range(-40, (GRID_ROWS - 1) * PITCH + 40),
      color: deco.pick(['#e2543e', '#f2a03d', '#37a6a0', '#e8e3d5', '#b04df0']),
    });
    if (k % 6 === 0) {
      const stand = { kind: 'lifeguard', x: SAND_EDGE - 24, y: k * 190 + 60, color: '#e8e3d5' };
      city.beachProps.push(stand);
      city.colliders.push({ x: stand.x - 8, y: stand.y - 8, w: 16, h: 16 });
    }
    if (k % 5 === 0) {
      city.hangouts.push({ x: deco.range(WATER_EDGE + 30, SAND_EDGE - 20), y: deco.range(0, (GRID_ROWS - 1) * PITCH), kind: 'beach' });
    }
  }
  city.beachProps.push({ kind: 'volleyball', x: -104, y: 3 * PITCH + 40, color: '#e8e3d5' });

  // A lighthouse on the northern point, standing in the shallows.
  city.lighthouse = { x: WATER_EDGE - 34, y: 40, r: 13 };
  city.colliders.push({ x: city.lighthouse.x - 12, y: city.lighthouse.y - 12, w: 24, h: 24 });

  // Coral Docks piers reach into the water along the southern shore rows,
  // with cranes on the beachfront above them.
  for (const bj of [7, 8]) {
    const y = bj * PITCH + 30;
    city.piers.push({ x: -262, y, w: 190, h: 16 });
    city.piers.push({ x: -262, y: y + 74, w: 150, h: 16 });
    const crane = { x: SAND_EDGE - 6, y: y + 30, w: 18, h: 18 };
    city.colliders.push(crane);
    city.piers.push({ crane });
  }

  // Zebra crossings: one band on each arm of every intersection.
  for (let j = 0; j < GRID_ROWS; j++) {
    for (let i = 0; i < GRID_COLS; i++) {
      const { x, y } = intersectionAt(i, j);
      const off = STREET_HALF + 10;
      city.crossings.push({ x, y: y - off, w: STREET - 6, h: 13, axis: 'v' });
      city.crossings.push({ x, y: y + off, w: STREET - 6, h: 13, axis: 'v' });
      city.crossings.push({ x: x - off, y, w: 13, h: STREET - 6, axis: 'h' });
      city.crossings.push({ x: x + off, y, w: 13, h: STREET - 6, axis: 'h' });
    }
  }

  // Street lamps at intersection corners (their glow joins the night layer).
  for (let j = 0; j < GRID_ROWS; j++) {
    for (let i = 0; i < GRID_COLS; i++) {
      const { x, y } = intersectionAt(i, j);
      city.lamps.push({ x: x - STREET_HALF - 4, y: y - STREET_HALF - 4 });
      city.lamps.push({ x: x + STREET_HALF + 4, y: y + STREET_HALF + 4 });
    }
  }

  // Parked-car bays along the kerbs in front of the blocks.
  for (const block of city.blocks) {
    for (const side of ['N', 'S', 'W', 'E']) {
      const spots = layout.int(0, 2);
      for (let s = 0; s < spots; s++) {
        const t = 0.25 + 0.5 * layout.float();
        // Parallel parking: cars on the roads north/south of a block face
        // along the horizontal street; on the west/east roads, along the
        // vertical one — never nose-in to the buildings.
        if (side === 'N') city.parkedSpots.push({ x: block.x + block.w * t, y: block.y - STREET_HALF + 10, angle: 0, block });
        if (side === 'S') city.parkedSpots.push({ x: block.x + block.w * t, y: block.y + block.h + STREET_HALF - 10, angle: Math.PI, block });
        if (side === 'W') city.parkedSpots.push({ x: block.x - STREET_HALF + 10, y: block.y + block.h * t, angle: Math.PI / 2, block });
        if (side === 'E') city.parkedSpots.push({ x: block.x + block.w + STREET_HALF - 10, y: block.y + block.h * t, angle: -Math.PI / 2, block });
      }
    }
  }

  city.districtAt = (x, y) => districtAt(city, x, y);
  city.groundAt = (x, y) => groundAt(city, x, y);
  city.blockAt = (x, y) => blockAt(city, x, y);
  return city;
}

export function blockAt(city, x, y) {
  const bi = Math.floor((x - STREET_HALF) / PITCH);
  const bj = Math.floor((y - STREET_HALF) / PITCH);
  if (x < STREET_HALF || y < STREET_HALF) return null;
  return city.blocks.find((b) => b.bi === bi && b.bj === bj) || null;
}

export function districtAt(city, x, y) {
  if (x < SAND_EDGE) return DISTRICT_BY_ID.palmline;
  const block = blockAt(city, x, y);
  if (block) return DISTRICT_BY_ID[block.district];
  const bi = Math.max(0, Math.min(GRID_COLS - 2, Math.round(x / PITCH - 0.5)));
  const bj = Math.max(0, Math.min(GRID_ROWS - 2, Math.round(y / PITCH - 0.5)));
  return DISTRICT_BY_ID[districtForBlock(bi, bj)];
}

// What is under a point: 'water' | 'sand' | 'road' | 'sidewalk' | 'ground'.
export function groundAt(city, x, y) {
  if (x < WATER_EDGE) return 'water';
  if (x < SAND_EDGE) return 'sand';
  const fx = ((x % PITCH) + PITCH) % PITCH;
  const fy = ((y % PITCH) + PITCH) % PITCH;
  const onRoadX = fx < STREET_HALF || fx > PITCH - STREET_HALF;
  const onRoadY = fy < STREET_HALF || fy > PITCH - STREET_HALF;
  if (onRoadX || onRoadY) return 'road';
  const block = blockAt(city, x, y);
  if (block) {
    const edge = Math.min(x - block.x, block.x + block.w - x, y - block.y, block.y + block.h - y);
    if (edge < 15) return 'sidewalk';
    return 'ground';
  }
  return 'ground';
}

// Segment vs building rectangles: true when nothing built blocks the view.
export function lineOfSight(city, ax, ay, bx, by) {
  for (const r of city.buildings) {
    if (segmentHitsRect(ax, ay, bx, by, r)) return false;
  }
  return true;
}

export function segmentHitsRect(ax, ay, bx, by, r) {
  // Cheap reject: bounding boxes do not overlap.
  if (Math.max(ax, bx) < r.x || Math.min(ax, bx) > r.x + r.w) return false;
  if (Math.max(ay, by) < r.y || Math.min(ay, by) > r.y + r.h) return false;
  if (pointInRect(ax, ay, r) || pointInRect(bx, by, r)) return true;
  const edges = [
    [r.x, r.y, r.x + r.w, r.y],
    [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
    [r.x + r.w, r.y + r.h, r.x, r.y + r.h],
    [r.x, r.y + r.h, r.x, r.y],
  ];
  for (const [cx, cy, dx, dy] of edges) {
    if (segmentsCross(ax, ay, bx, by, cx, cy, dx, dy)) return true;
  }
  return false;
}

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = direction(cx, cy, dx, dy, ax, ay);
  const d2 = direction(cx, cy, dx, dy, bx, by);
  const d3 = direction(ax, ay, bx, by, cx, cy);
  const d4 = direction(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function direction(ax, ay, bx, by, px, py) {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

// Push a circle at (x, y) with radius r out of every collider; returns the
// corrected position. Used by the player, pedestrians and cars alike.
export function collideCircle(city, x, y, r) {
  for (const c of city.colliders) {
    const nx = Math.max(c.x, Math.min(x, c.x + c.w));
    const ny = Math.max(c.y, Math.min(y, c.y + c.h));
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        y = ny + (dy / d) * r;
      } else {
        // Centre inside the rect: leave by the nearest face.
        const left = x - c.x;
        const right = c.x + c.w - x;
        const top = y - c.y;
        const bottom = c.y + c.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = c.x - r;
        else if (m === right) x = c.x + c.w + r;
        else if (m === top) y = c.y - r;
        else y = c.y + c.h + r;
      }
    }
  }
  return { x, y };
}

// Hash of the layout stream, handy in tests that prove determinism.
export function cityFingerprint(city) {
  return hashString(JSON.stringify(city.blocks.map((b) => [b.bi, b.bj, b.kind, b.buildings.length])));
}
