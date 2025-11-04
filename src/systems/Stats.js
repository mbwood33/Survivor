// Stats system and shot resolution helpers

export function createDefaultStats() {
  return {
    damage: 1.0,
    attackSpeed: 0.0, // 0.25 => 25% faster (CD / 1.25)
    projectileSpeed: 1.0,
    projectileAmount: 0, // additive
    projSize: 1.0, // projectile size multiplier
    duration: 1.0,
    pierce: 0,
    critChance: 0.0,
    critMult: 2.0,
    magnet: 1.0,
    moveSpeed: 1.0,
  };
}

// Compute a resolved per-shot snapshot from base weapon and current stats.
export function resolveShot(base, stats) {
  return {
    damage: base.damage * stats.damage,
    cooldown: base.cooldown / (1 + stats.attackSpeed),
    speed: base.speed * stats.projectileSpeed,
    lifetime: base.lifetime * stats.duration,
    amount: Math.max(1, (base.amount | 0) + (stats.projectileAmount | 0)),
    size: (base.size || 1) * (stats.projSize || 1),
    pierce: (base.pierce || 0) + (stats.pierce || 0),
    critChance: (base.critChance || 0) + (stats.critChance || 0),
    critMult: stats.critMult || 2.0,
  };
}
