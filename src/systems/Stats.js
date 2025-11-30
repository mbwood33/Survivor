// Stats system and shot resolution helpers

export function createDefaultStats() {
  return {
    damage: 1.0,          // multiplicative damage scaler (percent-based)
    baseDamageAdd: 0,     // additive base damage (+X to base before multipliers)
    attackSpeed: 0.0,     // additive bonus (0.25 => +25% rate)
    projectileSpeed: 1.0,
    projectileAmount: 0,  // additive
    projSize: 1.0,        // projectile size multiplier
    duration: 1.0,
    pierce: 0,
    critChance: 0.0,
    critMult: 2.0,
    magnet: 1.0,
    moveSpeed: 1.0,

    // New Stats for Milestone 10
    regen: 0,             // HP per second
    maxHpMult: 1.0,       // Multiplier for max HP
    shield: 0,            // Current shield (managed by Player, but stat defines max/regen)
    maxShield: 0,         // Max shield value
    dodge: 0.0,           // Chance to dodge (0.0 - 1.0)
    armor: 0,             // Flat damage reduction
    xpMult: 1.0,          // XP gain multiplier
    luck: 1.0,            // Luck multiplier for upgrades
    lifeSteal: 0.0,       // Chance to heal 1 HP on hit
    reflect: 0.0,         // Damage reflected back
    revivalChance: 0.0,   // Chance to revive (not in spec but good to have?) - sticking to spec
  };
}

// Compute a resolved per-shot snapshot from base weapon and current stats.
export function resolveShot(base, stats) {
  // Cooldown formula: base / (1 + attackSpeed)
  // Example: +100% attack speed => cooldown / 2 => 2x fire rate
  const cd = base.cooldown / (1 + (stats.attackSpeed || 0));

  return {
    damage: (base.damage + (stats.baseDamageAdd || 0)) * stats.damage,
    cooldown: Math.max(0.05, cd), // Cap max fire rate
    speed: base.speed * stats.projectileSpeed,
    lifetime: base.lifetime * stats.duration,
    amount: Math.max(1, (base.amount | 0) + (stats.projectileAmount | 0)),
    size: (base.size || 1) * (stats.projSize || 1),
    pierce: (base.pierce || 0) + (stats.pierce || 0),
    critChance: (base.critChance || 0) + (stats.critChance || 0),
    critMult: stats.critMult || 2.0,
  };
}
