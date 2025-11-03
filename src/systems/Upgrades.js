import { RNG } from "../utils/RNG.js";

export const RarityWeights = { common: 70, uncommon: 25, rare: 5 };

export const Upgrades = [
  // Common
  { id:'dmg1',  tier:'common',  text:'+15% Damage',       apply:s=>s.damage*=1.15, lanes:['damage'] },
  { id:'atk1',  tier:'common',  text:'+15% Attack Speed', apply:s=>s.attackSpeed+=0.15, lanes:['attackSpeed'] },
  { id:'spd1',  tier:'common',  text:'+20% Projectile Speed', apply:s=>s.projectileSpeed*=1.20, lanes:['projectileSpeed'] },
  { id:'amt1',  tier:'common',  text:'+1 Projectile',     apply:s=>s.projectileAmount+=1, lanes:['projectileAmount'] },
  { id:'area1', tier:'common',  text:'+15% Area',         apply:s=>s.area*=1.15, lanes:['area'] },
  { id:'dur1',  tier:'common',  text:'+15% Duration',     apply:s=>s.duration*=1.15, lanes:['duration'] },
  { id:'mag1',  tier:'common',  text:'+25% Magnet',       apply:s=>s.magnet*=1.25, lanes:['magnet'] },
  { id:'ms1',   tier:'common',  text:'+15% Move Speed',   apply:s=>s.moveSpeed*=1.15, lanes:['moveSpeed'] },

  // Uncommon
  { id:'dmg2',  tier:'uncommon', text:'+30% Damage',       apply:s=>s.damage*=1.30, lanes:['damage'] },
  { id:'atk2',  tier:'uncommon', text:'+25% Attack Speed', apply:s=>s.attackSpeed+=0.25, lanes:['attackSpeed'] },
  { id:'pier1', tier:'uncommon', text:'+1 Pierce',         apply:s=>s.pierce+=1, lanes:['pierce'] },
  { id:'crit1', tier:'uncommon', text:'+8% Crit Chance',   apply:s=>s.critChance+=0.08, lanes:['critChance'] },
  { id:'ms2',   tier:'uncommon', text:'+25% Move Speed',   apply:s=>s.moveSpeed*=1.25, lanes:['moveSpeed'] },

  // Rare
  { id:'amt2',  tier:'rare', text:'+2 Projectiles',        apply:s=>s.projectileAmount+=2, lanes:['projectileAmount'] },
  { id:'dmg3',  tier:'rare', text:'+60% Damage',           apply:s=>s.damage*=1.60, lanes:['damage'] },
  { id:'atk3',  tier:'rare', text:'+40% Attack Speed',     apply:s=>s.attackSpeed+=0.40, lanes:['attackSpeed'] },
  { id:'crit2', tier:'rare', text:'+15% Crit Chance',      apply:s=>s.critChance+=0.15, lanes:['critChance'] },
  { id:'ms3',   tier:'rare', text:'+40% Move Speed',       apply:s=>s.moveSpeed*=1.40, lanes:['moveSpeed'] },
];

export const UpgradeCaps = {
  damage: 10, attackSpeed: 10, area: 10, duration: 10,
  projectileSpeed: 10, magnet: 8, projectileAmount: 9,
  pierce: 6, critChance: 8, moveSpeed: 8,
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
    // roll tier, then pick avoiding duplicate ids and lanes
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
