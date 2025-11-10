import { RNG } from "../utils/RNG.js";

// Four-tier rarity system
export const RarityWeights = { common: 68, rare: 24, super: 7, ultra: 1 };

export const Upgrades = [
  // Common
  { id:'dmg1',  tier:'common',  text:'+15% Damage (Mult)', apply:s=>s.damage*=1.15, lanes:['damage'] },
  { id:'atk1',  tier:'common',  text:'+15% Attack Speed',  apply:s=>s.attackSpeed+=0.15, lanes:['attackSpeed'] },
  { id:'spd1',  tier:'common',  text:'+20% Projectile Speed', apply:s=>s.projectileSpeed*=1.20, lanes:['projectileSpeed'] },
  { id:'amt1',  tier:'common',  text:'+1 Projectile',      apply:s=>s.projectileAmount+=1, lanes:['projectileAmount'] },
  { id:'psz1',  tier:'common',  text:'+8% Projectile Size', apply:s=>s.projSize*=1.08, lanes:['projSize'] },
  { id:'dur1',  tier:'common',  text:'+15% Duration',      apply:s=>s.duration*=1.15, lanes:['duration'] },
  { id:'mag1',  tier:'common',  text:'+25% Magnet',        apply:s=>s.magnet*=1.25, lanes:['magnet'] },
  { id:'ms1',   tier:'common',  text:'+15% Move Speed',    apply:s=>s.moveSpeed*=1.15, lanes:['moveSpeed'] },

  // Rare
  { id:'dmg2',  tier:'rare',    text:'+25% Damage (Mult)', apply:s=>s.damage*=1.25, lanes:['damage'] },
  { id:'atk2',  tier:'rare',    text:'+25% Attack Speed',  apply:s=>s.attackSpeed+=0.25, lanes:['attackSpeed'] },
  { id:'pier1', tier:'rare',    text:'+1 Pierce',          apply:s=>s.pierce+=1, lanes:['pierce'] },
  { id:'crit1', tier:'rare',    text:'+8% Crit Chance',    apply:s=>s.critChance+=0.08, lanes:['critChance'] },
  { id:'bdmg1', tier:'rare',    text:'+1 Base Damage',     apply:s=>s.baseDamageAdd+=1, lanes:['baseDamage'] },
  { id:'heal1', tier:'rare',    text:'Heal 20% HP',        kind:'heal', healPct:0.20, lanes:['heal'] },
  { id:'ms2',   tier:'rare',    text:'+25% Move Speed',    apply:s=>s.moveSpeed*=1.25, lanes:['moveSpeed'] },

  // Super Rare
  { id:'amt2',  tier:'super',   text:'+2 Projectiles',     apply:s=>s.projectileAmount+=2, lanes:['projectileAmount'] },
  { id:'dmg3',  tier:'super',   text:'+40% Damage (Mult)', apply:s=>s.damage*=1.40, lanes:['damage'] },
  { id:'atk3',  tier:'super',   text:'+40% Attack Speed',  apply:s=>s.attackSpeed+=0.40, lanes:['attackSpeed'] },
  { id:'crit2', tier:'super',   text:'+15% Crit Chance',   apply:s=>s.critChance+=0.15, lanes:['critChance'] },
  { id:'bdmg2', tier:'super',   text:'+2 Base Damage',     apply:s=>s.baseDamageAdd+=2, lanes:['baseDamage'] },
  { id:'heal2', tier:'super',   text:'Heal 35% HP',        kind:'heal', healPct:0.35, lanes:['heal'] },

  // Ultra Rare
  { id:'dmg4',  tier:'ultra',   text:'+60% Damage (Mult)', apply:s=>s.damage*=1.60, lanes:['damage'] },
  { id:'atk4',  tier:'ultra',   text:'+60% Attack Speed',  apply:s=>s.attackSpeed+=0.60, lanes:['attackSpeed'] },
  { id:'bdmg3', tier:'ultra',   text:'+3 Base Damage',     apply:s=>s.baseDamageAdd+=3, lanes:['baseDamage'] },
  { id:'heal3', tier:'ultra',   text:'Heal 50% HP',        kind:'heal', healPct:0.50, lanes:['heal'] },
];

export const UpgradeCaps = {
  damage: 20, baseDamage: 12, attackSpeed: 20, projSize: 12, duration: 20,
  projectileSpeed: 20, magnet: 12, projectileAmount: 12,
  pierce: 10, critChance: 12, moveSpeed: 12,
};

export function createLaneCounters() {
  const counters = {};
  for (const lane of Object.keys(UpgradeCaps)) counters[lane] = 0;
  return counters;
}

function weightedPick(weights, rng) {
  const entries = Object.entries(weights);
  let sum = 0; for (const [, v] of entries) sum += v;
  let r = rng.float(0, sum);
  for (const [k, v] of entries) { if ((r -= v) <= 0) return k; }
  return entries[entries.length-1][0];
}

function isAllowed(upg, counters) {
  // Allowed if every lane has not reached its cap
  for (const lane of (upg.lanes || [])) {
    const cap = UpgradeCaps[lane];
    if (cap != null && counters[lane] >= cap) return false;
  }
  return true;
}

export function pickDraft(rng, counters, count = 3) {
  const picks = [];
  const usedIds = new Set();
  const usedLanes = new Set();
  const allowedAll = Upgrades.filter(u => isAllowed(u, counters));
  const tryPick = () => {
    // roll tier, then pick avoiding duplicate ids and lanes; small bias to include heal early
    let tier = weightedPick(RarityWeights, rng);
    let bucket = Upgrades.filter(u => u.tier === tier && isAllowed(u, counters));
    if (bucket.length === 0) bucket = allowedAll;
    if (bucket.length === 0) return null;
    let candidate = null;
    // Prefer items whose lanes do not intersect usedLanes
    const fits = bucket.filter(u => (u.lanes || []).every(l => !usedLanes.has(l)) && !usedIds.has(u.id));
    const source = fits.length > 0 ? fits : bucket;
    // Try a few times to find a non-duplicate id
    for (let guard = 0; guard < 30; guard++) {
      const u = source[Math.floor(rng.next() * source.length)];
      if (!usedIds.has(u.id)) { candidate = u; break; }
    }
    if (!candidate) candidate = source[0];
    return candidate;
  };
  for (let i = 0; i < count; i++) {
    const cand = tryPick();
    if (!cand) break;
    picks.push(cand);
    usedIds.add(cand.id);
    for (const l of (cand.lanes || [])) usedLanes.add(l);
  }
  return picks;
}
