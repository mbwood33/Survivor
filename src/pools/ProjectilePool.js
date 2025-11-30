import { PROJECTILES, WORLD } from "../config.js";
import { circleIntersectsAabb } from "../utils/MathUtil.js";

// Enhanced projectile pool supporting various weapon behaviors
export class ProjectilePool {
  constructor(scene) {
    this.scene = scene;
    this.items = new Array(PROJECTILES.maxPool);
    this.free = [];
    for (let i = 0; i < PROJECTILES.maxPool; i++) this.free.push(i);
    this.countActive = 0;

    // Arrays for data-oriented design
    this.pos = new Array(PROJECTILES.maxPool).fill(0).map(() => ({ x: 0, y: 0 }));
    this.vel = new Array(PROJECTILES.maxPool).fill(0).map(() => ({ x: 0, y: 0 }));
    this.life = new Float32Array(PROJECTILES.maxPool);
    this.damage = new Float32Array(PROJECTILES.maxPool);
    this.radius = new Float32Array(PROJECTILES.maxPool).fill(PROJECTILES.radius);
    this.alive = new Array(PROJECTILES.maxPool).fill(false);
    this.collidesTerrain = new Array(PROJECTILES.maxPool).fill(true);
    this.hitsLeft = new Int16Array(PROJECTILES.maxPool);
    this.critChance = new Float32Array(PROJECTILES.maxPool);
    this.critMult = new Float32Array(PROJECTILES.maxPool).fill(2);
    this.maxDistance = new Float32Array(PROJECTILES.maxPool).fill(0);
    this.travel = new Float32Array(PROJECTILES.maxPool).fill(0);

    // New properties for advanced behaviors
    this.options = new Array(PROJECTILES.maxPool); // Store full options object for custom logic
    this.state = new Array(PROJECTILES.maxPool).fill(0).map(() => ({})); // Per-projectile state (e.g. orbit phase)

    this.sprites = new Array(PROJECTILES.maxPool);

    // Create Graphics objects for sprites to allow dynamic coloring/shaping
    for (let i = 0; i < PROJECTILES.maxPool; i++) {
      // We'll use a container or just a Graphics object? 
      // Graphics is flexible.
      const s = scene.add.graphics();
      s.setDepth(6);
      s.setVisible(false);
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
    this.radius[id] = options.radius != null ? options.radius : PROJECTILES.radius;
    this.critChance[id] = options.critChance || 0;
    this.critMult[id] = options.critMult || 2;
    this.maxDistance[id] = options.maxDistance || 0;
    this.travel[id] = 0;
    const pierce = options.pierce || 0;
    this.hitsLeft[id] = 1 + Math.max(0, pierce | 0);
    this.options[id] = options;
    this.state[id] = {
      orbitTime: 0,
      returning: options.returning || false,
      returnState: 0, // 0: outbound, 1: returning
      initialPos: { x, y }
    };

    this._drawSprite(id);
    this.countActive++;
    return id;
  }

  _drawSprite(id) {
    const spr = this.sprites[id];
    spr.setVisible(true);
    spr.clear();
    const type = this.options[id].type;
    const r = this.radius[id];

    if (type === 'star_bolt') {
      spr.fillStyle(0xffff00, 1);
      spr.fillTriangle(-r, r, r, r, 0, -r); // Simple triangle
    } else if (type === 'prism_shot') {
      spr.fillStyle(0x00ff00, 1);
      spr.fillRect(-r, -r / 2, r * 2, r); // Beam-ish
    } else if (type === 'moon_disc') {
      spr.lineStyle(2, 0xccccff, 1);
      spr.strokeCircle(0, 0, r);
      spr.fillStyle(0xccccff, 0.5);
      spr.fillCircle(0, 0, r);
    } else if (type === 'magnet_orb') {
      spr.fillStyle(0xaa00ff, 0.7);
      spr.fillCircle(0, 0, r);
    } else {
      // Default
      spr.fillStyle(PROJECTILES.color, 1);
      spr.fillRect(-r * 1.5, -r / 2, r * 3, r);
    }
    spr.setPosition(this.pos[id].x, this.pos[id].y);
  }

  despawn(id) {
    if (!this.alive[id]) return;
    this.alive[id] = false;
    this.sprites[id].setVisible(false);
    this.free.push(id);
    this.countActive--;
  }

  update(dt, obstacleGrid) {
    for (let id = 0; id < this.alive.length; id++) {
      if (!this.alive[id]) continue;

      const opts = this.options[id];
      const state = this.state[id];

      // Custom behaviors
      if (opts.type === 'star_bolt' && opts.launchDelay > 0) {
        // Orbit phase
        state.orbitTime += dt;
        if (state.orbitTime < opts.launchDelay) {
          const player = this.scene.player;
          const angle = opts.orbitAngle + state.orbitTime * 5; // Rotate
          const dist = 40;
          this.pos[id].x = player.pos.x + Math.cos(angle) * dist;
          this.pos[id].y = player.pos.y + Math.sin(angle) * dist;
          this.sprites[id].setPosition(this.pos[id].x, this.pos[id].y);
          this.sprites[id].rotation = angle + Math.PI / 2;
          continue; // Skip normal movement
        } else if (!state.launched) {
          // Launch!
          state.launched = true;
          const angle = Math.random() * Math.PI * 2;
          this.vel[id].x = Math.cos(angle) * opts.launchSpeed;
          this.vel[id].y = Math.sin(angle) * opts.launchSpeed;
        }
      }

      if (opts.type === 'magnet_orb') {
        // Pull enemies
        const pullRadius = 150 * (opts.pullStrength || 1);
        const enemies = this.scene.enemyPool.active;
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = this.pos[id].x - e.pos.x;
          const dy = this.pos[id].y - e.pos.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < pullRadius * pullRadius) {
            const dist = Math.sqrt(d2) || 1;
            const force = 100 * (opts.pullStrength || 1) / dist; // Simple inverse linear
            e.push(dx / dist * force, dy / dist * force);
          }
        }
      }

      // Movement
      const p = this.pos[id];
      const v = this.vel[id];
      const oldX = p.x, oldY = p.y;
      const stepX = v.x * dt;
      const stepY = v.y * dt;
      const newX = oldX + stepX;
      const newY = oldY + stepY;

      // Terrain Collision
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
          if (circleIntersectsAabb(newX, newY, r, o.aabb)) { collided = true; break; }
        }
        if (collided) {
          // Bounce logic could go here
          this.despawn(id); continue;
        }
      }

      p.x = newX; p.y = newY;
      this.travel[id] += Math.hypot(stepX, stepY);

      // Returning Logic
      if (state.returning) {
        if (state.returnState === 0) { // Outbound
          if (this.travel[id] >= this.maxDistance[id]) {
            state.returnState = 1; // Start return
            this.travel[id] = 0; // Reset travel for return trip? Or just track total?
            // Calculate return velocity
            // Moon Disc: curve? For now, straight back to player
            // Spec: "Calculates a return angle... Base = angle back toward player... Offset = small random"
            const player = this.scene.player;
            const dx = player.pos.x - p.x;
            const dy = player.pos.y - p.y;
            const angle = Math.atan2(dy, dx);
            const offset = (Math.random() - 0.5) * 0.5; // +/- ~15 deg
            const speed = Math.hypot(v.x, v.y);
            v.x = Math.cos(angle + offset) * speed;
            v.y = Math.sin(angle + offset) * speed;
          }
        } else { // Returning
          // Check if close to player to despawn
          const player = this.scene.player;
          const dx = player.pos.x - p.x;
          const dy = player.pos.y - p.y;
          if (dx * dx + dy * dy < 30 * 30) {
            this.despawn(id); continue;
          }
        }
      } else {
        // Normal max distance
        if (this.maxDistance[id] > 0 && this.travel[id] >= this.maxDistance[id]) {
          // Prism Shot Split
          if (opts.type === 'prism_shot' && opts.splitCount > 0) {
            this._splitPrism(id);
          }
          this.despawn(id); continue;
        }
      }

      this.life[id] -= dt;
      if (this.life[id] <= 0) { this.despawn(id); continue; }

      // Bounds check
      if (p.x < -64 || p.y < -64 || p.x > WORLD.width + 64 || p.y > WORLD.height + 64) {
        this.despawn(id); continue;
      }

      const spr = this.sprites[id];
      spr.setPosition(p.x, p.y);
      spr.rotation = Math.atan2(v.y, v.x);
    }
  }

  _splitPrism(id) {
    const opts = this.options[id];
    const p = this.pos[id];
    const v = this.vel[id];
    const speed = Math.hypot(v.x, v.y);
    const angle = Math.atan2(v.y, v.x);

    for (let i = 0; i < opts.splitCount; i++) {
      const spread = (Math.PI / 4) * (i / (opts.splitCount - 1 || 1) - 0.5); // +/- 22.5 deg
      const newAngle = angle + spread;
      this.spawn(p.x, p.y, Math.cos(newAngle) * speed, Math.sin(newAngle) * speed, this.damage[id] * 0.5, 1, {
        type: 'prism_sub',
        radius: this.radius[id] * 0.5,
        pierce: opts.pierce,
        critChance: this.critChance[id],
        critMult: this.critMult[id]
      });
    }
  }
}
