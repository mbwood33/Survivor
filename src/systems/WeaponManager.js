import { WeaponDefinitions } from "./WeaponDefinitions.js";
import { resolveShot } from "./Stats.js";

export class WeaponManager {
    constructor(scene, player) {
        this.scene = scene;
        this.player = player;
        this.activeWeapons = []; // Array of { def, level, stats, cooldownTimer, state }
        this.maxWeapons = 3;
        this.accumulatedDistance = 0; // For Meteor Knuckle
        this.lastPos = { x: player.pos.x, y: player.pos.y };
    }

    getAvailableWeaponUpgrades() {
        const offers = [];

        // 1. Existing weapons that can be upgraded
        for (const w of this.activeWeapons) {
            const nextLevel = w.level + 1;
            const upgrade = w.def.upgrades.find(u => u.level === nextLevel);
            if (upgrade) {
                offers.push({
                    type: 'weapon_upgrade',
                    id: w.def.id,
                    name: w.def.name,
                    level: nextLevel,
                    text: upgrade.desc || "Upgrade stats",
                    tier: 'common', // Default tier
                    icon: w.def.id // Placeholder for icon
                });
            }
        }

        // 2. New weapons if slots available
        if (this.activeWeapons.length < this.maxWeapons) {
            for (const [id, def] of Object.entries(WeaponDefinitions)) {
                if (!this.activeWeapons.find(w => w.def.id === id)) {
                    offers.push({
                        type: 'new_weapon',
                        id: id,
                        name: def.name,
                        level: 1,
                        text: "New Weapon: " + def.name,
                        tier: 'rare', // New weapons are rare?
                        icon: id
                    });
                }
            }
        }

        return offers;
    }

    // Adds a new weapon or upgrades an existing one
    addWeapon(id) {
        const existing = this.activeWeapons.find(w => w.def.id === id);
        if (existing) {
            this._upgradeWeapon(existing);
        } else {
            if (this.activeWeapons.length >= this.maxWeapons) {
                console.warn("Weapon slots full!");
                return;
            }
            const def = WeaponDefinitions[id];
            if (!def) { console.warn(`Weapon ${id} not found`); return; }
            const newWeapon = {
                def: def,
                level: 1,
                stats: { ...def.stats },
                cooldownTimer: 0,
                state: {}, // Per-weapon state (e.g. orbit angles)
            };
            this.activeWeapons.push(newWeapon);
            console.log(`Added weapon: ${def.name}`);
        }
    }

    _upgradeWeapon(weapon) {
        const nextLevel = weapon.level + 1;
        const upgrade = weapon.def.upgrades.find(u => u.level === nextLevel);
        if (upgrade) {
            weapon.level = nextLevel;
            // Apply stat deltas
            for (const [key, val] of Object.entries(upgrade.stats)) {
                weapon.stats[key] = (weapon.stats[key] || 0) + val;
            }
            console.log(`Upgraded ${weapon.def.name} to level ${weapon.level}`);
        }
    }

    update(dt) {
        // Track movement for distance-based weapons
        const dx = this.player.pos.x - this.lastPos.x;
        const dy = this.player.pos.y - this.lastPos.y;
        const dist = Math.hypot(dx, dy);
        this.accumulatedDistance += dist;
        this.lastPos.x = this.player.pos.x;
        this.lastPos.y = this.player.pos.y;

        for (const weapon of this.activeWeapons) {
            // Apply global stats (cooldown reduction, damage mult, etc.)
            // We resolve stats every frame or cache them? For now, resolve on fire or use simple multipliers.
            // Let's use a simplified resolution here to avoid heavy object creation per frame.

            if (weapon.def.id === 'meteor_knuckle') {
                this._updateMeteorKnuckle(weapon, dt);
            } else {
                weapon.cooldownTimer -= dt;
                if (weapon.cooldownTimer <= 0) {
                    this._fireWeapon(weapon);
                }
            }
        }
    }

    _fireWeapon(weapon) {
        // Resolve effective stats
        // We mix weapon base stats with player global stats
        const globalStats = this.player.stats;

        // Calculate cooldown first to reset timer
        // Base cooldown / (1 + attackSpeedBonus)
        // Fixed: Use additive attack speed from global stats
        const cd = Math.max(0.1, weapon.stats.cooldown / (1 + (globalStats.attackSpeed || 0)));
        weapon.cooldownTimer = cd;

        // Fire logic based on type
        switch (weapon.def.type) {
            case 'projectile':
                this._fireProjectile(weapon, globalStats);
                break;
            case 'aoe':
                this._fireAoE(weapon, globalStats);
                break;
            case 'sweeping':
                this._fireSweeping(weapon, globalStats);
                break;
            case 'returning':
                this._fireReturning(weapon, globalStats);
                break;
        }
    }

    _updateMeteorKnuckle(weapon, dt) {
        weapon.cooldownTimer -= dt; // Internal cooldown
        if (weapon.cooldownTimer > 0) return;

        const threshold = weapon.stats.distance; // Distance needed
        if (this.accumulatedDistance >= threshold) {
            this.accumulatedDistance -= threshold;
            this._fireSweeping(weapon, this.player.stats); // Reuse sweeping logic or custom
            weapon.cooldownTimer = weapon.stats.cooldown;
        }
    }

    _getEffectiveStats(weapon, globalStats) {
        const s = weapon.stats;
        return {
            damage: s.damage * (globalStats.damage || 1),
            amount: s.amount + (globalStats.projectileAmount || 0), // Global amount adds to all? Or just projectiles?
            // Let's say global projectileAmount adds to everything for fun, or restrict it.
            // The spec says "Quantity: Boosts number of projectiles, pulses, sweeps". So yes.
            amount: Math.floor(s.amount + (globalStats.projectileAmount || 0)),
            size: s.size * (globalStats.projSize || 1),
            speed: s.speed * (globalStats.projectileSpeed || 1),
            duration: s.duration * (globalStats.duration || 1),
            critChance: s.critChance + (globalStats.critChance || 0),
            critMult: s.critMult, // Global crit damage not in Upgrades.js yet, but we can add later
            pierce: s.pierce + (globalStats.pierce || 0),
            bounce: s.bounce, // Global bounce?
            distance: s.distance, // Global range?
            knockback: s.knockback,
            arc: s.arc,
            statusPotency: s.statusPotency,
        };
    }

    _fireProjectile(weapon, globalStats) {
        const stats = this._getEffectiveStats(weapon, globalStats);
        const pool = this.scene.projectiles;

        if (weapon.def.id === 'star_bolt') {
            // Star Bolt: Orbit then launch
            // For now, let's just launch them outward in a burst for simplicity, 
            // or implement the orbit logic in the projectile itself?
            // The spec says "Orbiting darts that burst outward".
            // Let's spawn them with a special behavior ID or just standard spread for now.
            // To implement orbit properly, we need a new Projectile behavior.
            // I'll implement a "delayed launch" or just standard burst for MVP.
            // Spec: "When off cooldown, weapon spawns N small darts orbiting... After orbit time... launch"
            // I'll spawn them with a 'star_bolt' behavior tag.

            for (let i = 0; i < stats.amount; i++) {
                // Random angle for orbit start? Or evenly spaced?
                const angle = (Math.PI * 2 * i) / stats.amount;
                pool.spawn(this.player.pos.x, this.player.pos.y, 0, 0, stats.damage, stats.duration + 2, {
                    type: 'star_bolt',
                    orbitAngle: angle,
                    launchSpeed: stats.speed,
                    launchDelay: stats.duration,
                    radius: 4 * stats.size, // Visual size
                    pierce: stats.pierce,
                    critChance: stats.critChance,
                    critMult: stats.critMult,
                    bounce: stats.bounce,
                    maxDistance: stats.distance
                });
            }
        } else if (weapon.def.id === 'prism_shot') {
            // Prism Shot: Beam that splits
            // Find target
            const target = this.scene._findNearestEnemy(this.player.pos.x, this.player.pos.y);
            let dir = { x: 1, y: 0 };
            if (target) {
                const dx = target.pos.x - this.player.pos.x;
                const dy = target.pos.y - this.player.pos.y;
                const len = Math.hypot(dx, dy);
                if (len > 0) dir = { x: dx / len, y: dy / len };
            } else if (this.player.lastAimDir) {
                dir = this.player.lastAimDir;
            }

            pool.spawn(this.player.pos.x, this.player.pos.y, dir.x * stats.speed, dir.y * stats.speed, stats.damage, 2, {
                type: 'prism_shot',
                radius: 6 * stats.size,
                pierce: stats.pierce,
                critChance: stats.critChance,
                critMult: stats.critMult,
                splitCount: stats.amount,
                splitDistance: stats.distance * 0.6, // Split at 60% max range
                maxDistance: stats.distance
            });
        }
    }

    _fireAoE(weapon, globalStats) {
        const stats = this._getEffectiveStats(weapon, globalStats);
        const pool = this.scene.aoePool; // Need to create this
        if (!pool) return;

        if (weapon.def.id === 'sunflare_pulse') {
            pool.spawn(this.player.pos.x, this.player.pos.y, {
                type: 'sunflare',
                damage: stats.damage,
                radius: 150 * stats.size,
                duration: stats.duration,
                knockback: stats.knockback,
                critChance: stats.critChance
            });
        } else if (weapon.def.id === 'frost_nova') {
            pool.spawn(this.player.pos.x, this.player.pos.y, {
                type: 'frost_nova',
                damage: stats.damage,
                radius: 200 * stats.size,
                duration: stats.duration, // Slow duration
                statusPotency: stats.statusPotency,
                critChance: stats.critChance
            });
        }
    }

    _fireSweeping(weapon, globalStats) {
        const stats = this._getEffectiveStats(weapon, globalStats);
        const pool = this.scene.sweepingPool; // Need to create this
        if (!pool) return;

        if (weapon.def.id === 'arc_blade') {
            // Direction? Facing direction or nearest enemy?
            // Usually facing.
            let dir = this.player.lastAimDir || { x: 1, y: 0 };
            // If moving, use move dir
            if (Math.abs(this.player.vel.x) > 10 || Math.abs(this.player.vel.y) > 10) {
                const len = Math.hypot(this.player.vel.x, this.player.vel.y);
                dir = { x: this.player.vel.x / len, y: this.player.vel.y / len };
            }

            const angle = Math.atan2(dir.y, dir.x);

            pool.spawn(this.player.pos.x, this.player.pos.y, {
                type: 'arc_blade',
                damage: stats.damage,
                angle: angle,
                arc: (stats.arc || 120) * (Math.PI / 180),
                radius: 80 * stats.size,
                duration: stats.duration,
                knockback: stats.knockback,
                critChance: stats.critChance
            });
        } else if (weapon.def.id === 'meteor_knuckle') {
            pool.spawn(this.player.pos.x, this.player.pos.y, {
                type: 'meteor_knuckle',
                damage: stats.damage,
                radius: 100 * stats.size,
                duration: 0.2, // Explosion flash
                knockback: stats.knockback,
                critChance: stats.critChance
            });
        }
    }

    _fireReturning(weapon, globalStats) {
        const stats = this._getEffectiveStats(weapon, globalStats);
        const pool = this.scene.projectiles;

        // Target nearest
        const target = this.scene._findNearestEnemy(this.player.pos.x, this.player.pos.y);
        let dir = { x: 1, y: 0 };
        if (target) {
            const dx = target.pos.x - this.player.pos.x;
            const dy = target.pos.y - this.player.pos.y;
            const len = Math.hypot(dx, dy);
            if (len > 0) dir = { x: dx / len, y: dy / len };
        } else if (this.player.lastAimDir) {
            dir = this.player.lastAimDir;
        }

        if (weapon.def.id === 'moon_disc') {
            pool.spawn(this.player.pos.x, this.player.pos.y, dir.x * stats.speed, dir.y * stats.speed, stats.damage, 5, {
                type: 'moon_disc',
                radius: 10 * stats.size,
                pierce: stats.pierce,
                critChance: stats.critChance,
                critMult: stats.critMult,
                maxDistance: stats.distance,
                returning: true
            });
        } else if (weapon.def.id === 'magnet_orb') {
            pool.spawn(this.player.pos.x, this.player.pos.y, dir.x * stats.speed, dir.y * stats.speed, stats.damage, 5, {
                type: 'magnet_orb',
                radius: 12 * stats.size,
                pierce: stats.pierce,
                critChance: stats.critChance,
                critMult: stats.critMult,
                maxDistance: stats.distance,
                returning: true,
                pullStrength: stats.statusPotency
            });
        }
    }
}
