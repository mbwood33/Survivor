// Survivor Clone - Global configuration and constants
// These values centralize tunable parameters used across systems.

export const GAME = {
  // Virtual resolution (logical game size). Integer-scaled for crisp pixels.
  width: 640,
  height: 360,
  backgroundColor: 0x14171a,
  fixedDt: 1 / 60, // 60 Hz fixed step for deterministic physics/movement
};

export const WORLD = {
  width: 8000,
  height: 8000,
};

export const INPUT = {
  // Gamepad deadzone for left stick. Below this magnitude we ignore input.
  gamepadDeadzone: 0.2,
  // Input smoothing factor [0..1]; higher = snappier, lower = smoother.
  smoothingK: 0.35,
};

export const PLAYER = {
  // Visual rectangle size (blue square)
  size: 24,
  // Neon cyan for player
  color: 0x14e6ff,
  // Kinematic parameters (tuned for crisp but weighty feel)
  maxSpeed: 220,
  accel: 2000,
  friction: 1800,
  // Combat stats (will be used in milestones 5/6)
  hpMax: 100,
  // Weapon defaults (milestone 6)
  projDamage: 4,
  projSpeed: 520,
  projLifetime: 1.4,
  fireCooldown: 0.35,
  projectilesPerVolley: 1,
  spreadDeg: 0,
  // XP progression
  pickupRadius: 28,
  magnetRadius: 180,
  magnetPullSpeed: 420,
};

export const OBSTACLES = {
  // Spatial hash cell size — roughly 2x typical collider size works well
  cellSize: 128,
  // Procedural placement counts
  minCount: 1500,
  maxCount: 2500,
  // Colors for placeholder visuals
  treeColor: 0x00ff85, // neon green
  rockColor: 0x8a8fff, // soft neon violet
};

export const ENEMIES = {
  // Spawning and basic behaviors (milestone 5 baseline)
  color: 0xff2a6d, // hot pink/red neon
  size: 20,
  hp: 20,
  speed: 90,
  spawnRadiusMin: 600,
  spawnRadiusMax: 900,
  maxActive: 600,
  spawnPerSecond: 1.5,
  spawnTimeMs: 500,
};

export const PROJECTILES = {
  color: 0x00e5ff, // bright cyan
  radius: 4,
  maxPool: 300,
};

export const XP_ORBS = {
  color: 0x39ff14, // neon green
  radius: 6,
  maxPool: 2000,
};
