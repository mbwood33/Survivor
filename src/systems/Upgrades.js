import { RNG } from "../utils/RNG.js";
import { WeaponDefinitions } from "./WeaponDefinitions.js";

// Talent Definitions
export const Talents = {
  spright: { id: 'spright', name: 'Spright', text: '+15% Move Speed', maxLevel: 5, apply: s => s.moveSpeed += 0.15 },
  enbiggen: { id: 'enbiggen', name: 'Enbiggen', text: '+15% Size', maxLevel: 5, apply: s => s.projSize += 0.15 },
  barrier: { id: 'barrier', name: 'Barrier', text: '+20 Max Shield', maxLevel: 5, apply: s => s.maxShield += 20 },
  restore: { id: 'restore', name: 'Restore', text: '+1 HP/sec', maxLevel: 5, apply: s => s.regen += 1 },
  accelerate: { id: 'accelerate', name: 'Accelerate', text: '+20% Proj Speed', maxLevel: 5, apply: s => s.projectileSpeed += 0.20 },
  sharpen: { id: 'sharpen', name: 'Sharpen', text: '+10% Crit Chance', maxLevel: 5, apply: s => s.critChance += 0.10 },
  maximize: { id: 'maximize', name: 'Maximize', text: '+20% Max HP', maxLevel: 5, apply: s => s.maxHpMult += 0.20 },
  elude: { id: 'elude', name: 'Elude', text: '+10% Dodge Chance', maxLevel: 5, apply: s => s.dodge += 0.10 },
  amplify: { id: 'amplify', name: 'Amplify', text: '+15% Damage', maxLevel: 5, apply: s => s.damage += 0.15 },
  haste: { id: 'haste', name: 'Haste', text: '+15% Attack Speed', maxLevel: 5, apply: s => s.attackSpeed += 0.15 },
  deflect: { id: 'deflect', name: 'Deflect', text: '+20% Reflect Damage', maxLevel: 5, apply: s => s.reflect += 0.20 },
  drain: { id: 'drain', name: 'Drain', text: '+5% Life Steal', maxLevel: 5, apply: s => s.lifeSteal += 0.05 },
  magnetize: { id: 'magnetize', name: 'Magnetize', text: '+30% Magnet Range', maxLevel: 5, apply: s => s.magnet += 0.30 },
  fortify: { id: 'fortify', name: 'Fortify', text: '+2 Armor', maxLevel: 5, apply: s => s.armor += 2 },
  sustain: { id: 'sustain', name: 'Sustain', text: '+20% Duration', maxLevel: 5, apply: s => s.duration += 0.20 },
  enlighten: { id: 'enlighten', name: 'Enlighten', text: '+10% XP Gain', maxLevel: 5, apply: s => s.xpMult += 0.10 },
  afflict: {
    id: 'afflict', name: 'Afflict', text: '+Enemy Stats (More XP)', maxLevel: 5, apply: (s, scene) => {
      // This is tricky, it affects global difficulty, not just player stats.
      // We might need a callback or handle it in GameScene.
      // For now, let's say it adds to a 'curse' stat that GameScene reads?
      // Or we just modify difficulty directly if we have access.
      // The apply function usually takes (stats).
      // Let's add a 'curse' stat to player.
      s.curse = (s.curse || 0) + 1;
    }
  },
  derange: {
    id: 'derange', name: 'Derange', text: 'Boost Random Talent', maxLevel: 999, apply: (s, scene, player) => {
      // Logic to boost random active talent
      // This needs access to player's active talents.
      // We'll handle this special case in the pick handler.
    }
  },
  auspicate: { id: 'auspicate', name: 'Auspicate', text: '+20% Luck', maxLevel: 5, apply: s => s.luck += 0.20 },
};

export class UpgradeManager {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.activeTalents = []; // Array of { id, level }
    this.maxTalents = 3;
  }

  getAvailableTalents() {
    const offers = [];

    // 1. Upgrade existing talents
    for (const t of this.activeTalents) {
      const def = Talents[t.id];
      if (t.level < def.maxLevel || def.id === 'derange') {
        offers.push({
          type: 'talent_upgrade',
          id: t.id,
          name: def.name,
          level: t.level + 1,
          text: def.text,
          tier: 'common',
          def: def
        });
      }
    }

    // 2. New talents if slots available
    if (this.activeTalents.length < this.maxTalents) {
      for (const [id, def] of Object.entries(Talents)) {
        if (!this.activeTalents.find(t => t.id === id)) {
          offers.push({
            type: 'new_talent',
            id: id,
            name: def.name,
            level: 1,
            text: def.text,
            tier: 'common',
            def: def
          });
        }
      }
    }
    return offers;
  }

  applyTalent(id) {
    const def = Talents[id];
    let active = this.activeTalents.find(t => t.id === id);

    if (!active) {
      if (this.activeTalents.length >= this.maxTalents) return;
      active = { id: id, level: 0 };
      this.activeTalents.push(active);
    }

    active.level++;

    // Special handling
    if (id === 'afflict') {
      this.scene.difficulty.danger += 0.5; // Instant difficulty bump?
      // Or just let the stat update handle it if we hook it up.
    }
    if (id === 'derange') {
      // Pick another random active talent and boost it
      const others = this.activeTalents.filter(t => t.id !== 'derange');
      if (others.length > 0) {
        const target = others[Math.floor(Math.random() * others.length)];
        this.applyTalent(target.id); // Recursive apply?
        // Note: This might exceed max level for that talent, which is cool for "Derange"
      }
    } else {
      // Standard stat application
      def.apply(this.player.stats, this.scene, this.player);
    }
  }
}

export function pickDraft(scene, player, count = 3) {
  const weaponMgr = scene.weaponManager;
  const upgradeMgr = scene.upgradeManager; // We need to attach this to scene

  // Get all valid offers
  const weaponOffers = weaponMgr.getAvailableWeaponUpgrades();
  const talentOffers = upgradeMgr.getAvailableTalents();

  const allOffers = [...weaponOffers, ...talentOffers];

  if (allOffers.length === 0) return [{ type: 'heal', name: 'Full Heal', desc: 'Heal 100%', id: 'heal' }]; // Fallback

  // Shuffle and pick
  // Use player luck to influence rarity? (Not implemented yet, just random)
  const rng = new RNG(Date.now());
  const picks = [];
  const usedIds = new Set();

  for (let i = 0; i < count; i++) {
    if (allOffers.length === 0) break;
    const idx = Math.floor(rng.next() * allOffers.length);
    const pick = allOffers[idx];

    // Avoid duplicates in same draft
    if (!usedIds.has(pick.id)) {
      picks.push(pick);
      usedIds.add(pick.id);
    }

    // Remove from pool to avoid picking same exact thing twice? 
    // Actually duplicates are bad UX.
    allOffers.splice(idx, 1);
  }

  return picks;
}
