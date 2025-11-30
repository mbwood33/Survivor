import { PLAYER, WORLD, PROJECTILES } from "../config.js";
import { createDefaultStats, resolveShot } from "../systems/Stats.js";
import {
  clamp,
  vec2, vec2Length, vec2Normalize, vec2MoveTowardZero,
  aabbIntersects, aabbOverlapX, aabbOverlapY
} from "../utils/MathUtil.js";

// PlayerController encapsulates player state (position, velocity, collider),
// movement, collisions, combat stats, XP/leveling, and auto-fire behavior.
export class PlayerController {
  constructor(scene, x, y) {
    this.scene = scene;

    // Continuous position/velocity vectors in world coordinates
    this.pos = vec2(x, y);
    this.vel = vec2(0, 0);

    // Movement tuning (base from config; dynamic derived from stats each step)
    this.baseMaxSpeed = PLAYER.maxSpeed;
    this.maxSpeed = PLAYER.maxSpeed;
    this.accel = PLAYER.accel;
    this.friction = PLAYER.friction;

    // Collider for AABB collision (size matches visual square)
    this.collider = { w: PLAYER.size, h: PLAYER.size, ox: -PLAYER.size / 2, oy: -PLAYER.size / 2 };

    // Combat/XP baselines
    this.hpMax = PLAYER.hp;
    this.hp = this.hpMax;
    this.shield = 0; // Current shield
    this.regenTimer = 0;
    this.shieldRegenTimer = 0;

    this.xp = 0;
    this.level = 1;
    this.xpForNext = 10;
    this.pickupRadius = PLAYER.pickupRadius;
    this.magnetRadius = PLAYER.magnetRadius;
    this.magnetPullSpeed = PLAYER.magnetPullSpeed;

    // Weapon base stats (basic straight projectile)
    // REMOVED: Handled by WeaponManager now
    // this.baseProjDamage = PLAYER.projDamage;
    // ...

    // Stats
    this.stats = createDefaultStats();
    this.statsCounters = {}; // provided by scene

    // Visual: blue rectangle for the player
    this.rect = scene.add.rectangle(x, y, PLAYER.size, PLAYER.size, PLAYER.color).setOrigin(0.5, 0.5);
    this.rect.setDepth(10);

    // Temp arrays reused per step to avoid GC
    this._candidates = [];

    this.invulnTime = 0; // Time player is invulnerable after taking damage
  }

  getAabb() {
    return {
      x: this.pos.x + this.collider.ox,
      y: this.pos.y + this.collider.oy,
      w: this.collider.w,
      h: this.collider.h,
    };
  }

  getSweepAabb(dx, dy) {
    const a = this.getAabb();
    const sx = dx < 0 ? dx : 0;
    const sy = dy < 0 ? dy : 0;
    return { x: a.x + sx, y: a.y + sy, w: a.w + Math.abs(dx), h: a.h + Math.abs(dy) };
  }

  applyInput(dir, dt) {
    // Immediate, frictionless movement: set velocity directly based on input
    const len = Math.hypot(dir.x, dir.y);
    if (len > 0) {
      const nx = dir.x / len, ny = dir.y / len;
      this.vel.x = nx * this.maxSpeed;
      this.vel.y = ny * this.maxSpeed;
    } else {
      this.vel.x = 0; this.vel.y = 0;
    }
  }

  resolveCollisions(obstacleGrid, obstacles, dx, dy) {
    // Broadphase query: expand the player AABB by motion to get potential colliders.
    const sweep = this.getSweepAabb(dx, dy);
    const candidates = obstacleGrid.query(sweep, this._candidates);
    const epsilon = 1e-6;

    // X axis
    if (dx !== 0) {
      this.pos.x += dx;
      let aabb = this.getAabb();
      for (let iter = 0; iter < 4; iter++) {
        let resolved = false;
        for (let i = 0; i < candidates.length; i++) {
          const obs = candidates[i];
          if (!obs.solid) continue;
          if (!aabbIntersects(aabb, obs.aabb)) continue;
          const mtvX = aabbOverlapX(aabb, obs.aabb);
          if (mtvX !== 0) {
            this.pos.x += mtvX + (mtvX > 0 ? epsilon : -epsilon);
            this.vel.x = 0;
            aabb = this.getAabb();
            resolved = true;
          }
        }
        if (!resolved) break;
      }
    }

    // Y axis
    if (dy !== 0) {
      this.pos.y += dy;
      let aabb = this.getAabb();
      for (let iter = 0; iter < 4; iter++) {
        let resolved = false;
        for (let i = 0; i < candidates.length; i++) {
          const obs = candidates[i];
          if (!obs.solid) continue;
          if (!aabbIntersects(aabb, obs.aabb)) continue;
          const mtvY = aabbOverlapY(aabb, obs.aabb);
          if (mtvY !== 0) {
            this.pos.y += mtvY + (mtvY > 0 ? epsilon : -epsilon);
            this.vel.y = 0;
            aabb = this.getAabb();
            resolved = true;
          }
        }
        if (!resolved) break;
      }
    }

    // Clamp to world bounds; zero velocity components if clamped
    const beforeX = this.pos.x, beforeY = this.pos.y;
    this.pos.x = clamp(this.pos.x, 0, WORLD.width);
    this.pos.y = clamp(this.pos.y, 0, WORLD.height);
    if (this.pos.x !== beforeX) this.vel.x = 0;
    if (this.pos.y !== beforeY) this.vel.y = 0;
  }

  step(dt, inputDir, obstacleGrid, obstacles) {
    this.applyInput(inputDir, dt);
    const dx = this.vel.x * dt;
    const dy = this.vel.y * dt;
    this.resolveCollisions(obstacleGrid, obstacles, dx, dy);

    // Invulnerability timer
    if (this.invulnTime > 0) {
      this.invulnTime -= dt;
      if (this.invulnTime < 0) this.invulnTime = 0;
    }

    // Regen Logic
    if (this.stats.regen > 0 && this.hp < this.hpMax) {
      this.regenTimer += dt;
      if (this.regenTimer >= 1.0) {
        this.heal(this.stats.regen);
        this.regenTimer = 0;
      }
    }

    // Shield Logic
    // "Barrier: Adds/increases shield - shield takes damage instead of player... shield regenerates quickly after not taking damage for a while"
    if (this.stats.maxShield > 0) {
      if (this.shield < this.stats.maxShield) {
        this.shieldRegenTimer -= dt;
        if (this.shieldRegenTimer <= 0) {
          // Regenerate 10% of max shield per second? Or flat?
          // Spec says "regenerates quickly". Let's do 20% per sec.
          this.shield = Math.min(this.stats.maxShield, this.shield + this.stats.maxShield * 0.2 * dt);
        }
      }
    }

    // Update max HP based on stats
    const targetMaxHp = Math.floor(PLAYER.hp * (this.stats.maxHpMult || 1));
    if (this.hpMax !== targetMaxHp) {
      const pct = this.hp / this.hpMax;
      this.hpMax = targetMaxHp;
      this.hp = Math.floor(this.hpMax * pct); // Maintain percentage
    }

    // Visuals
    this.rect.setPosition(this.pos.x, this.pos.y);

    // Shield visual (blue outline or overlay)
    if (this.shield > 0) {
      this.rect.setStrokeStyle(2, 0x00ffff, 0.8);
    } else {
      this.rect.setStrokeStyle(0);
    }
  }

  // tryAutoFire removed. WeaponManager handles this.
  updateAim(dt, enemyQueryFn) {
    // We still need to track aim direction for some weapons
    const target = enemyQueryFn(this.pos.x, this.pos.y);
    if (target) {
      const dx = target.pos.x - this.pos.x;
      const dy = target.pos.y - this.pos.y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-5) {
        this.lastAimDir = { x: dx / len, y: dy / len };
      }
    } else if (Math.abs(this.vel.x) > 10 || Math.abs(this.vel.y) > 10) {
      // If moving and no target, aim forward? Or keep last?
      // Usually keep last known good aim or move dir.
      // Let's keep lastAimDir as is, but maybe update it if moving?
      // Actually, let's just update lastAimDir to movement if no target.
      const len = Math.hypot(this.vel.x, this.vel.y);
      this.lastAimDir = { x: this.vel.x / len, y: this.vel.y / len };
    }
  }

  addXP(value) {
    // Enlighten: Gives you more XP from all sources
    const mult = this.stats.xpMult || 1.0;
    this.xp += value * mult;
    if (this.xp >= this.xpForNext) {
      this.xp -= this.xpForNext;
      this.level++;
      this.xpForNext = Math.floor(this.xpForNext * 1.5); // Simplified curve for now
      if (this.scene && this.scene.events) this.scene.events.emit('player:levelup', this);
    }
  }

  damage(amount) {
    if (this.invulnTime > 0) return;

    // Dodge check
    if (this.stats.dodge > 0 && Math.random() < this.stats.dodge) {
      // Dodged!
      this.scene._floatText(this.pos.x, this.pos.y - 20, "DODGE", 0xaaaaaa);
      return;
    }

    // Armor reduction
    // "Fortify: Increases armor/reduces damage taken"
    // Let's say armor is flat reduction, or percentage?
    // Spec says "Increases armor/reduces damage taken".
    // Let's implement armor as flat reduction, min 1 damage.
    let taken = Math.max(1, amount - (this.stats.armor || 0));

    // Shield absorption
    if (this.shield > 0) {
      if (this.shield >= taken) {
        this.shield -= taken;
        taken = 0;
      } else {
        taken -= this.shield;
        this.shield = 0;
      }
      this.shieldRegenTimer = 3.0; // Reset regen delay (3 seconds)
    }

    if (taken > 0) {
      this.hp -= taken;
      this.invulnTime = PLAYER.invulnTime;
      this.scene.cameras.main.shake(100, 0.01);
      this.scene._spawnHitParticles(this.pos.x, this.pos.y, false); // Player hit particles?

      // Reflect damage
      if (this.stats.reflect > 0) {
        // Deal damage back to attackers? 
        // We don't have reference to attacker here easily unless passed.
        // For now, maybe spawn a "Thorns" AoE?
        // Or just ignore for now as it requires architectural change to pass attacker.
        // Let's spawn a small AoE blast around player for reflect.
        this.scene.aoePool.spawn(this.pos.x, this.pos.y, {
          type: 'sunflare', // Reuse sunflare visual
          damage: taken * this.stats.reflect,
          radius: 100,
          duration: 0.2
        });
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.scene.gameOver();
    }
  }

  heal(amount) {
    this.hp = Math.min(this.hpMax, this.hp + amount);
    this.scene._damageNumber(this.pos.x, this.pos.y - 20, amount, false, false, true);
  }

  onHitEnemy() {
    // Life Steal check
    if (this.stats.lifeSteal > 0) {
      if (Math.random() < this.stats.lifeSteal) {
        this.heal(1);
      }
      // "Over 100% will guarantee 1 heal, and give a chance to heal for a total of 2."
      if (this.stats.lifeSteal > 1.0 && Math.random() < (this.stats.lifeSteal - 1.0)) {
        this.heal(1);
      }
    }
  }
}
