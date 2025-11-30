export const WeaponDefinitions = {
  // --- Projectile Weapons ---
  star_bolt: {
    id: "star_bolt",
    name: "Star Bolt",
    type: "projectile",
    description: "Orbiting darts that burst outward.",
    stats: {
      damage: 10,
      cooldown: 1.5,
      duration: 0.8, // orbit time
      speed: 450,
      amount: 3,
      size: 1.0,
      critChance: 0.05,
      critMult: 1.5,
      pierce: 1,
      bounce: 0,
      distance: 600,
    },
    upgrades: [
      { level: 2, stats: { amount: 1, damage: 5 } },
      { level: 3, stats: { cooldown: -0.2, pierce: 1 } },
      { level: 4, stats: { amount: 2, size: 0.2 } },
      { level: 5, stats: { damage: 10, bounce: 1 } },
    ]
  },
  prism_shot: {
    id: "prism_shot",
    name: "Prism Shot",
    type: "projectile",
    description: "Beam that splits into smaller shots.",
    stats: {
      damage: 15,
      cooldown: 2.0,
      speed: 600,
      amount: 3, // sub-projectiles
      size: 1.0, // beam width scale
      critChance: 0.10,
      critMult: 2.0,
      pierce: 2,
      bounce: 0,
      distance: 500, // split point / max range
    },
    upgrades: [
      { level: 2, stats: { damage: 5, amount: 1 } },
      { level: 3, stats: { cooldown: -0.3, size: 0.2 } },
      { level: 4, stats: { amount: 2, pierce: 1 } },
      { level: 5, stats: { damage: 10, distance: 100 } },
    ]
  },

  // --- AoE Weapons ---
  sunflare_pulse: {
    id: "sunflare_pulse",
    name: "Sunflare Pulse",
    type: "aoe",
    description: "Expanding ring of solar energy.",
    stats: {
      damage: 12,
      cooldown: 3.0,
      duration: 1.0, // expansion time
      size: 1.0, // max radius scale (base ~150)
      amount: 1, // pulses per trigger
      critChance: 0.05,
      critMult: 1.5,
      knockback: 20,
    },
    upgrades: [
      { level: 2, stats: { damage: 6, size: 0.2 } },
      { level: 3, stats: { cooldown: -0.5, amount: 1 } },
      { level: 4, stats: { damage: 8, knockback: 10 } },
      { level: 5, stats: { size: 0.4, amount: 1 } },
    ]
  },
  frost_nova: {
    id: "frost_nova",
    name: "Frost Nova",
    type: "aoe",
    description: "Freezing burst that slows enemies.",
    stats: {
      damage: 8,
      cooldown: 4.0,
      duration: 2.0, // slow duration
      size: 1.0, // radius scale (base ~200)
      amount: 1,
      critChance: 0.0,
      critMult: 1.0,
      statusPotency: 0.3, // 30% slow
    },
    upgrades: [
      { level: 2, stats: { damage: 4, duration: 0.5 } },
      { level: 3, stats: { cooldown: -0.5, statusPotency: 0.1 } },
      { level: 4, stats: { size: 0.3, damage: 5 } },
      { level: 5, stats: { duration: 1.0, statusPotency: 0.2 } }, // Heavy slow
    ]
  },

  // --- Sweeping Weapons ---
  arc_blade: {
    id: "arc_blade",
    name: "Arc Blade",
    type: "sweeping",
    description: "Wide slash in front of player.",
    stats: {
      damage: 20,
      cooldown: 1.2,
      duration: 0.3, // swing time
      size: 1.0, // range/thickness
      amount: 1, // slashes
      arc: 120, // degrees
      knockback: 50,
      critChance: 0.15,
      critMult: 2.0,
    },
    upgrades: [
      { level: 2, stats: { damage: 8, arc: 20 } },
      { level: 3, stats: { cooldown: -0.2, amount: 1 } },
      { level: 4, stats: { damage: 10, knockback: 20 } },
      { level: 5, stats: { size: 0.3, amount: 1 } },
    ]
  },
  meteor_knuckle: {
    id: "meteor_knuckle",
    name: "Meteor Knuckle",
    type: "sweeping", // implemented as short-range sweep/blast
    description: "Explosive punch triggered by movement.",
    stats: {
      damage: 30,
      cooldown: 0.5, // internal cooldown
      distance: 200, // movement threshold to trigger
      size: 1.0, // explosion radius
      amount: 1,
      knockback: 80,
      critChance: 0.20,
      critMult: 2.5,
    },
    upgrades: [
      { level: 2, stats: { damage: 10, distance: -20 } },
      { level: 3, stats: { size: 0.3, amount: 1 } },
      { level: 4, stats: { damage: 15, knockback: 30 } },
      { level: 5, stats: { distance: -30, amount: 1 } },
    ]
  },

  // --- Returning Weapons ---
  moon_disc: {
    id: "moon_disc",
    name: "Moon Disc",
    type: "returning",
    description: "Boomerang disc with curved return.",
    stats: {
      damage: 18,
      cooldown: 2.5,
      speed: 500,
      amount: 1,
      size: 1.0,
      critChance: 0.1,
      critMult: 1.5,
      pierce: 999, // infinite pierce usually for boomerangs
      distance: 400, // max range
      bounce: 0,
    },
    upgrades: [
      { level: 2, stats: { damage: 6, size: 0.2 } },
      { level: 3, stats: { cooldown: -0.4, amount: 1 } },
      { level: 4, stats: { damage: 8, distance: 100 } },
      { level: 5, stats: { amount: 1, speed: 100 } },
    ]
  },
  magnet_orb: {
    id: "magnet_orb",
    name: "Magnet Orb",
    type: "returning",
    description: "Orb that pulls enemies while traveling.",
    stats: {
      damage: 8, // tick damage? or hit damage
      cooldown: 3.5,
      speed: 300,
      amount: 1,
      size: 1.0, // pull radius scale
      critChance: 0.0,
      critMult: 1.0,
      pierce: 999,
      distance: 350,
      statusPotency: 1.0, // pull strength
    },
    upgrades: [
      { level: 2, stats: { damage: 4, size: 0.2 } },
      { level: 3, stats: { cooldown: -0.5, amount: 1 } },
      { level: 4, stats: { statusPotency: 0.5, distance: 50 } },
      { level: 5, stats: { damage: 6, amount: 1 } },
    ]
  },
};
