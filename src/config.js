// Survivor Clone - Global configuration and constants
// These values centralize tunable parameters used across systems.

export const GAME = {
  width: 1280,
  height: 720,
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
  color: 0x2b6cb0,
  // Kinematic parameters (tuned for crisp but weighty feel)
  maxSpeed: 220,
  accel: 2000,
  friction: 1800,
  // Combat stats (will be used in milestones 5/6)
  hpMax: 100,
  // Weapon defaults (milestone 6)
  projDamage: 2,
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
  treeColor: 0x2f9e44,
  rockColor: 0x6c757d,
};

export const ENEMIES = {
  // Spawning and basic behaviors (milestone 5 baseline)
  color: 0xc92a2a,
  size: 20,
  hp: 8,
  speed: 90,
  spawnRadiusMin: 600,
  spawnRadiusMax: 900,
  maxActive: 300,
  spawnPerSecond: 1.5,
};

export const PROJECTILES = {
  color: 0x3182ce,
  radius: 6,
  maxPool: 300,
};

export const XP_ORBS = {
  color: 0x38b000,
  radius: 6,
  maxPool: 300,
};

