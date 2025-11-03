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
    this.hpMax = PLAYER.hpMax;
    this.hp = this.hpMax;
    this.level = 1;
    this.xp = 0;
    this.xpForNext = 10;
    this.pickupRadius = PLAYER.pickupRadius;
    this.magnetRadius = PLAYER.magnetRadius;
    this.magnetPullSpeed = PLAYER.magnetPullSpeed;

    // Weapon base stats (basic straight projectile)
    this.baseProjDamage = PLAYER.projDamage;
    this.baseProjSpeed = PLAYER.projSpeed;
    this.baseProjLifetime = PLAYER.projLifetime;
    this.baseFireCooldown = PLAYER.fireCooldown;
    this.baseProjectilesPerVolley = PLAYER.projectilesPerVolley;
    this.baseSpreadDeg = PLAYER.spreadDeg;
    this.fireTimer = 0;
    this.lastAimDir = vec2(1, 0);
    this.volleyPhase = 0; // rotates radial firing when no target

    // Stats
    this.stats = createDefaultStats();
    this.statsCounters = {}; // provided by scene

    // Visual: blue rectangle for the player
    this.rect = scene.add.rectangle(x, y, PLAYER.size, PLAYER.size, PLAYER.color).setOrigin(0.5, 0.5);
    this.rect.setDepth(10);

    // Temp arrays reused per step to avoid GC
    this._candidates = [];
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
    // Accelerate toward input direction; treat near-zero as no input due to smoothing tail
    const len = Math.hypot(dir.x, dir.y);
    const threshold = 0.2; // deadzone for smoothed input
    if (len > threshold) {
      const nx = dir.x / len;
      const ny = dir.y / len;
      this.vel.x += nx * this.accel * dt;
      this.vel.y += ny * this.accel * dt;
    } else {
      vec2MoveTowardZero(this.vel, this.vel, this.friction, dt);
    }
    // Clamp velocity to max speed
    const spd = vec2Length(this.vel);
    if (spd > this.maxSpeed) {
      const s = this.maxSpeed / spd;
      this.vel.x *= s; this.vel.y *= s;
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
    this.rect.setPosition(this.pos.x, this.pos.y);
  }

  // Auto-fire towards nearest enemies; each projectile picks a target if available.
  tryAutoFire(dt, enemyQueryFn, projectilePool) {
    this.fireTimer -= dt;
    const baseWeapon = {
      damage: this.baseProjDamage,
      speed: this.baseProjSpeed,
      lifetime: this.baseProjLifetime,
      cooldown: this.baseFireCooldown,
      amount: this.baseProjectilesPerVolley,
      area: 1.0,
      pierce: 0,
      critChance: 0.0,
    };
    const resolved = resolveShot(baseWeapon, this.stats);
    if (this.fireTimer > 0) return;
    this.fireTimer += resolved.cooldown;

    // Aim determination
    const target = enemyQueryFn(this.pos.x, this.pos.y);
    let aim = this.lastAimDir;
    if (target) {
      const dx = target.pos.x - this.pos.x;
      const dy = target.pos.y - this.pos.y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-5) {
        aim = { x: dx / len, y: dy / len };
        this.lastAimDir = { x: aim.x, y: aim.y };
      }
    } else if (aim.x === 0 && aim.y === 0) {
      aim = { x: 1, y: 0 };
    }

    const count = resolved.amount;
    const radius = PROJECTILES.radius * resolved.area;

    if (target) {
      // Per-projectile targeting of nearest enemies
      const targets = this.scene._findNearestEnemies(this.pos.x, this.pos.y, 900, count);
      for (let i = 0; i < count; i++) {
        const tgt = targets.length > 0 ? targets[i % targets.length] : target;
        const dx = tgt.pos.x - this.pos.x;
        const dy = tgt.pos.y - this.pos.y;
        const len = Math.hypot(dx, dy) || 1;
        const dir = { x: dx / len, y: dy / len };
        projectilePool.spawn(
          this.pos.x,
          this.pos.y,
          dir.x * resolved.speed,
          dir.y * resolved.speed,
          resolved.damage,
          resolved.lifetime,
          { collidesTerrain: true, radius, critChance: resolved.critChance, critMult: resolved.critMult }
        );
      }
    } else {
      // No target: emit evenly around the player; rotate phase each volley
      const step = (Math.PI * 2) / count;
      for (let i = 0; i < count; i++) {
        const ang = this.volleyPhase + i * step;
        const dir = { x: Math.cos(ang), y: Math.sin(ang) };
        projectilePool.spawn(
          this.pos.x,
          this.pos.y,
          dir.x * resolved.speed,
          dir.y * resolved.speed,
          resolved.damage,
          resolved.lifetime,
          { collidesTerrain: true, radius, critChance: resolved.critChance, critMult: resolved.critMult }
        );
      }
      this.volleyPhase += 0.35;
    }
  }

  addXP(value) {
    this.xp += value;
    // Simple curve
    const need = Math.floor(10 + (this.level - 1) * 5 + Math.pow(this.level - 1, 1.2));
    this.xpForNext = Math.max(1, need);
    while (this.xp >= this.xpForNext) {
      this.xp -= this.xpForNext;
      this.level++;
      const n2 = Math.floor(10 + (this.level - 1) * 5 + Math.pow(this.level - 1, 1.2));
      this.xpForNext = Math.max(1, n2);
      if (this.scene && this.scene.events) this.scene.events.emit('player:levelup', this);
    }
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }
}

