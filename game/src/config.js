// config.js — the numbers and names PALMSHADE HEAT is built from.
//
// World geometry: a grid of intersections spaced PITCH apart, roads STREET
// wide centred on the grid lines, city blocks in the cells between. The sea
// lies west of the first road column: water, then a sand band, then the
// beachfront road. Everything else (vehicles, weapons, districts, wanted
// thresholds) is tuned here so the balance lives in one place.

export const PITCH = 240; // distance between neighbouring intersections (px)
export const STREET = 68; // road width (px)
export const STREET_HALF = STREET / 2;
export const GRID_COLS = 12; // intersections across (x: 0..11)
export const GRID_ROWS = 10; // intersections down (y: 0..9)
export const BLOCK = PITCH - STREET; // buildable block interior (172 px)

export const WATER_EDGE = -168; // x < WATER_EDGE is open sea
export const SAND_EDGE = -STREET_HALF; // WATER_EDGE..SAND_EDGE is beach sand
export const WORLD_MIN_X = -264;
export const WORLD_MAX_X = (GRID_COLS - 1) * PITCH + 120;
export const WORLD_MIN_Y = -120;
export const WORLD_MAX_Y = (GRID_ROWS - 1) * PITCH + 120;

export const LANE_OFFSET = 11; // traffic lane distance from a road centreline
export const DAY_LENGTH = 480; // real seconds per full in-game day
export const START_HOUR = 10.25; // a bright morning for a fresh arrival

// Wanted level: crime points feed stars at these thresholds.
export const STAR_THRESHOLDS = [1, 22, 48, 80, 118, 160];
export const CRIME_POINTS = {
  stealCar: 16,
  carjackMoving: 26,
  assault: 14,
  shoot: 10,
  kill: 42,
  hitPed: 30,
  hitCar: 8,
  hitCop: 30,
  explosion: 40,
  missionCrime: 18,
};
export const BUST_FINE_RATE = 0.18; // share of cash taken when busted
export const HOSPITAL_FEE = 120;

// Player tuning.
export const PLAYER_RADIUS = 10;
export const WALK_SPEED = 128;
export const SPRINT_SPEED = 196;
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_MAX_ARMOUR = 100;

// Vehicle models: original Port Palmshade iron. topSpeed in px/s, grip is a
// lateral-velocity kill rate, durability is hit points before a wreck.
export const VEHICLE_MODELS = [
  { id: 'solano', name: 'Solano', kind: 'sedan', topSpeed: 342, accel: 218, grip: 6.4, durability: 120, w: 21, h: 42, colors: ['#c8ccd2', '#7d8894', '#4d5d75', '#8c3b34', '#3f6b4f'] },
  { id: 'brisa', name: 'Brisa Roadster', kind: 'convertible', topSpeed: 398, accel: 268, grip: 7.2, durability: 88, w: 20, h: 40, colors: ['#e2543e', '#f2a03d', '#37a6a0', '#e8e3d5'] },
  { id: 'tiburon', name: 'Tiburón GT', kind: 'sports', topSpeed: 486, accel: 336, grip: 8.1, durability: 96, w: 21, h: 43, colors: ['#20242c', '#7a1f2b', '#274b8f', '#c0c6ce'] },
  { id: 'flete', name: 'Flete', kind: 'van', topSpeed: 296, accel: 176, grip: 5.2, durability: 170, w: 24, h: 48, colors: ['#d8d3c3', '#8a8f96', '#5d6d7e'] },
  { id: 'taxi', name: 'Taxi', kind: 'taxi', topSpeed: 336, accel: 214, grip: 6.2, durability: 118, w: 21, h: 42, colors: ['#f5b921'] },
  { id: 'ranchero', name: 'Ranchero', kind: 'pickup', topSpeed: 358, accel: 232, grip: 5.8, durability: 148, w: 22, h: 45, colors: ['#6b4a2f', '#40513b', '#74584a', '#93452e'] },
  { id: 'interceptor', name: 'PSPD Interceptor', kind: 'police', topSpeed: 428, accel: 292, grip: 7.6, durability: 150, w: 21, h: 43, colors: ['#1d2735'] },
];

// Weapons: fists plus two guns. damage per hit, rate in shots per second.
export const WEAPONS = {
  fists: { id: 'fists', name: 'FISTS', damage: 16, rate: 2.6, range: 30, spread: 0, speed: 0, auto: false, ammoMax: Infinity, sound: 'punch' },
  palm9: { id: 'palm9', name: 'PALM-9', damage: 26, rate: 3.4, range: 430, spread: 0.028, speed: 880, auto: false, ammoMax: 240, sound: 'pistol' },
  hornet: { id: 'hornet', name: 'HORNET SMG', damage: 17, rate: 9.5, range: 380, spread: 0.075, speed: 920, auto: true, ammoMax: 480, sound: 'smg' },
  scrap: { id: 'scrap', name: 'SCRAP PISTOL', damage: 9, rate: 1.5, range: 330, spread: 0.09, speed: 760, auto: false, ammoMax: Infinity, sound: 'pistol' },
  cop9: { id: 'cop9', name: 'PSPD SIDEARM', damage: 11, rate: 1.7, range: 350, spread: 0.07, speed: 800, auto: false, ammoMax: Infinity, sound: 'pistol' },
};

// The eight districts of Port Palmshade, west to east, north to south.
// roof: palette of rooftop colours; ground: block interior ground tint.
export const DISTRICTS = [
  { id: 'palmline', name: 'PALMLINE BEACH', tag: 'SUN, SAND AND BAD DECISIONS', roofs: ['#e8e0cc', '#dfd2ae', '#e5cfa8', '#d9c9a3'], ground: '#e6d7ac' },
  { id: 'flats', name: 'THE FLATS', tag: 'WORKING STREETS, QUIET PORCHES', roofs: ['#b9a58c', '#a89478', '#c2ae94', '#9c8a70'], ground: '#cfc0a0' },
  { id: 'palmera', name: 'OLD PALMERA', tag: 'EST. 1911 · CAFÉS AND COLONNADES', roofs: ['#d9b48c', '#cfa87e', '#e2c096', '#c49a6e'], ground: '#d8c49c' },
  { id: 'neon', name: 'NEON MILE', tag: 'THE STRIP THAT NEVER SLEEPS IN', roofs: ['#8f7f9e', '#7d6f92', '#9c86a8', '#6f6084'], ground: '#b3a6bd' },
  { id: 'mercado', name: 'MERCADO DISTRICT', tag: 'MARKETS, BANKS AND BACK ROOMS', roofs: ['#c7a06a', '#bb9257', '#d1ab74', '#a9854e'], ground: '#d3ba8a' },
  { id: 'azure', name: 'AZURE HEIGHTS', tag: 'OLD MONEY, NEW FENCES', roofs: ['#aebfd0', '#9fb2c6', '#bccbd9', '#93a8bd'], ground: '#c3ced6' },
  { id: 'docks', name: 'CORAL DOCKS', tag: 'CRANES, CONTAINERS AND QUIET MONEY', roofs: ['#9aa0a4', '#8b9296', '#a5abad', '#7e868a'], ground: '#b5b0a4' },
  { id: 'marina', name: 'PALMSHADE MARINA', tag: 'WHITE HULLS, BLUE WATER DREAMS', roofs: ['#cfdde8', '#bfd2e0', '#dce8ef', '#b2c7d6'], ground: '#ccd8ce' },
];

// Radio stations for the WebAudio synth: name, flavour line, pad progression.
export const RADIO_STATIONS = [
  { id: 'solfm', name: 'SOL FM 98.4', flavour: 'SYNTHWAVE · "PALMS OVER ASPHALT"', root: 110.0, mode: [0, 3, 7, 10] },
  { id: 'onda', name: 'ONDA 104.1', flavour: 'SALSA CLÁSICA · "BRISA DE MAYO"', root: 130.81, mode: [0, 4, 7, 11] },
  { id: 'coral', name: 'CORAL ROCK 91.7', flavour: 'SURF ROCK · "GLASS TIDE"', root: 98.0, mode: [0, 4, 7, 9] },
  { id: 'noche', name: 'RADIO NOCHE 88.9', flavour: 'BOLERO · "LUNA DE SAL"', root: 87.31, mode: [0, 3, 7, 8] },
];

export const SAVE_KEY = 'palmshade-heat-save-v1';
