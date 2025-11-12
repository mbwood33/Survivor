import { PROJECTILES, WORLD } from "../config.js";
import { circleIntersectsAabb } from "../utils/MathUtil.js";

// Lightweight projectile pool: moves straight, limited lifetime, circle collider.
export class ProjectilePool {
  constructor(scene) {
    this.scene = scene;
    this.items = new Array(PROJECTILES.maxPool);
    this.free = [];
    for (let i = 0; i < PROJECTILES.maxPool; i++) this.free.push(i);
    this.countActive = 0;

    this.pos = new Array(PROJECTILES.maxPool).fill(0).map(() => ({ x: 0, y: 0 }));
    this.vel = new Array(PROJECTILES.maxPool).fill(0).map(() => ({ x: 0, y: 0 }));
    this.life = new Float32Array(PROJECTILES.maxPool);
    this.damage = new Float32Array(PROJECTILES.maxPool);
    this.radius = new Float32Array(PROJECTILES.maxPool).fill(PROJECTILES.radius);
    this.alive = new Array(PROJECTILES.maxPool).fill(false);
    this.collidesTerrain = new Array(PROJECTILES.maxPool).fill(true);
    this.hitsLeft = new Int16Array(PROJECTILES.maxPool); // total hits allowed (1 + pierce)
    this.critChance = new Float32Array(PROJECTILES.maxPool);
    this.critMult = new Float32Array(PROJECTILES.maxPool).fill(2);
    this.maxDistance = new Float32Array(PROJECTILES.maxPool).fill(0);
    this.travel = new Float32Array(PROJECTILES.maxPool).fill(0);
    this.sprites = new Array(PROJECTILES.maxPool);

    for (let i = 0; i < PROJECTILES.maxPool; i++) {
      const len = Math.max(8, PROJECTILES.radius * 3);
      const thick = Math.max(2, Math.round(PROJECTILES.radius));
      const s = scene.add.rectangle(0, 0, len, thick, PROJECTILES.color).setOrigin(0.5);
      s.setVisible(false);
      s.setDepth(6);
      this.sprites[i] = s;
    }
  }

  spawn(x, y, vx, vy, damage, lifetime, options = {}) {
    if (this.free.length === 0) return -1;
    const id = this.free.pop();
    this.alive[id] = true;
    this.pos[id].x = x; this.pos[id].y = y;
    this.vel[id].x = vx; this.vel[id].y = vy;
    this.life[id] = lifetime;
    this.damage[id] = damage;
    this.collidesTerrain[id] = options.collidesTerrain !== undefined ? !!options.collidesTerrain : true;
    const radius = options.radius != null ? options.radius : PROJECTILES.radius;
    this.radius[id] = radius;
    this.critChance[id] = options.critChance || 0;
    this.critMult[id] = options.critMult || 2;
    this.maxDistance[id] = options.maxDistance || (Math.hypot(vx, vy) * lifetime);
    this.travel[id] = 0;
    const pierce = options.pierce || 0;
    this.hitsLeft[id] = 1 + Math.max(0, pierce|0);
    const spr = this.sprites[id];
    spr.setPosition(x, y);
    const len = Math.max(8, Math.round(radius * 3));
    const thick = Math.max(2, Math.round(radius));
    spr.width = len; spr.height = thick;
    spr.setVisible(true);
    this.countActive++;
    return id;
  }

  despawn(id) {
    if (!this.alive[id]) return;
    this.alive[id] = false;
    this.sprites[id].setVisible(false);
    this.free.push(id);
    this.countActive--;
  }

  update(dt, obstacleGrid) {
    // Move, age, and cull projectiles
    for (let id = 0; id < this.alive.length; id++) {
      if (!this.alive[id]) continue;
      const p = this.pos[id];
      const v = this.vel[id];
      const oldX = p.x, oldY = p.y;
      const stepX = v.x * dt;
      const stepY = v.y * dt;
      const newX = oldX + stepX;
      const newY = oldY + stepY;
      // Terrain collision check using sweep AABB (circle radius-inclusive)
      if (this.collidesTerrain[id] && obstacleGrid) {
        const r = this.radius[id];
        const sweep = {
          x: Math.min(oldX, newX) - r,
          y: Math.min(oldY, newY) - r,
          w: Math.abs(newX - oldX) + r * 2,
          h: Math.abs(newY - oldY) + r * 2,
        };
        const candidates = obstacleGrid.query(sweep, []);
        let collided = false;
        for (let i = 0; i < candidates.length; i++) {
          const o = candidates[i];
          if (!o.solid) continue;
          // Use new position for narrowphase; with small step size this is robust
          if (circleIntersectsAabb(newX, newY, r, o.aabb)) { collided = true; break; }
        }
        if (collided) { this.despawn(id); continue; }
      }
      p.x = newX; p.y = newY;
      this.travel[id] += Math.hypot(stepX, stepY);
      if (this.maxDistance[id] > 0 && this.travel[id] >= this.maxDistance[id]) { this.despawn(id); continue; }
      this.life[id] -= dt;
      if (this.life[id] <= 0) { this.despawn(id); continue; }
      // Outside world bounds + small margin
      if (p.x < -64 || p.y < -64 || p.x > WORLD.width + 64 || p.y > WORLD.height + 64) {
        this.despawn(id); continue;
      }
      const spr = this.sprites[id];
      spr.setPosition(p.x, p.y);
      spr.rotation = Math.atan2(v.y, v.x);
      // keep rectangle dimensions in sync with size
      const len = Math.max(8, Math.round(this.radius[id] * 3));
      const thick = Math.max(2, Math.round(this.radius[id]));
      spr.width = len; spr.height = thick;
    }
  }
}
