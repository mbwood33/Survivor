import { ENEMIES, WORLD } from "../config.js";
import { clamp, aabbIntersects, aabbOverlapX, aabbOverlapY } from "../utils/MathUtil.js";

// Simple chasing enemy represented by a red square. Collides with terrain unless ignoreTerrain is true.
export class Enemy {
  constructor(scene) {
    this.scene = scene;
    this.alive = false;
    this.pos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.radius = ENEMIES.size * 0.5; // for simple circle-based contact
    this.hpMax = ENEMIES.hp;
    this.hp = this.hpMax;
    this.speed = ENEMIES.speed;
    this.onHitTintTimer = 0;
    this.ignoreTerrain = false; // set true for ghosts/phasing enemies later
    this.collider = { w: ENEMIES.size, h: ENEMIES.size, ox: -ENEMIES.size / 2, oy: -ENEMIES.size / 2 };

    this.rect = scene.add.rectangle(0, 0, ENEMIES.size, ENEMIES.size, ENEMIES.color).setOrigin(0.5);
    this.rect.setDepth(5);
    this.rect.setVisible(false);
  }

  spawn(x, y, opts = {}) {
    this.alive = true;
    this.pos.x = x; this.pos.y = y;
    // Reset to base then apply multipliers
    this.hpMax = ENEMIES.hp;
    if (opts.hpMult != null) { this.hpMax = Math.max(1, Math.floor(ENEMIES.hp * opts.hpMult)); }
    if (opts.speedMult != null) { this.speed = ENEMIES.speed * opts.speedMult; } else { this.speed = ENEMIES.speed; }
    if (opts.sizeMult != null) {
      const size = ENEMIES.size * opts.sizeMult;
      this.rect.width = size; this.rect.height = size; this.radius = size * 0.5;
      this.collider = { w: size, h: size, ox: -size / 2, oy: -size / 2 };
    } else {
      this.rect.width = ENEMIES.size; this.rect.height = ENEMIES.size; this.radius = ENEMIES.size * 0.5;
      this.collider = { w: ENEMIES.size, h: ENEMIES.size, ox: -ENEMIES.size / 2, oy: -ENEMIES.size / 2 };
    }
    this.vel.x = 0; this.vel.y = 0;
    this.hp = this.hpMax;
    this.onHitTintTimer = 0;
    this.rect.setPosition(x, y);
    this.rect.setFillStyle(ENEMIES.color);
    this.rect.setVisible(true);
    this.isBoss = false; this.isFinal = false;
    return this;
  }

  despawn() {
    this.alive = false;
    this.rect.setVisible(false);
  }

  update(dt, playerPos) {
    if (!this.alive) return;
    // Simple steering: move toward player target direction at constant speed
    const dx = playerPos.x - this.pos.x;
    const dy = playerPos.y - this.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    this.vel.x = ux * this.speed;
    this.vel.y = uy * this.speed;

    const stepX = this.vel.x * dt;
    const stepY = this.vel.y * dt;

    if (this.ignoreTerrain) {
      this.pos.x += stepX;
      this.pos.y += stepY;
    } else {
      const grid = this.scene.obstacleGrid;
      const aabb = () => ({ x: this.pos.x + this.collider.ox, y: this.pos.y + this.collider.oy, w: this.collider.w, h: this.collider.h });
      const cur = aabb();
      const sweep = {
        x: Math.min(cur.x, cur.x + stepX),
        y: Math.min(cur.y, cur.y + stepY),
        w: cur.w + Math.abs(stepX),
        h: cur.h + Math.abs(stepY),
      };
      const candidates = grid.query(sweep, []);
      const epsilon = 1e-6;
      // X axis
      if (stepX !== 0) {
        this.pos.x += stepX;
        let a = aabb();
        for (let iter = 0; iter < 3; iter++) {
          let any = false;
          for (let i = 0; i < candidates.length; i++) {
            const o = candidates[i];
            if (!o.solid) continue;
            if (!aabbIntersects(a, o.aabb)) continue;
            const mtvX = aabbOverlapX(a, o.aabb);
            if (mtvX !== 0) {
              this.pos.x += mtvX + (mtvX > 0 ? epsilon : -epsilon);
              this.vel.x = 0; any = true; a = aabb();
            }
          }
          if (!any) break;
        }
      }
      // Y axis
      if (stepY !== 0) {
        this.pos.y += stepY;
        let a = aabb();
        for (let iter = 0; iter < 3; iter++) {
          let any = false;
          for (let i = 0; i < candidates.length; i++) {
            const o = candidates[i];
            if (!o.solid) continue;
            if (!aabbIntersects(a, o.aabb)) continue;
            const mtvY = aabbOverlapY(a, o.aabb);
            if (mtvY !== 0) {
              this.pos.y += mtvY + (mtvY > 0 ? epsilon : -epsilon);
              this.vel.y = 0; any = true; a = aabb();
            }
          }
          if (!any) break;
        }
      }
      // Clamp to world bounds
      this.pos.x = clamp(this.pos.x, 0, WORLD.width);
      this.pos.y = clamp(this.pos.y, 0, WORLD.height);
    }

    this.rect.setPosition(this.pos.x, this.pos.y);

    if (this.onHitTintTimer > 0) {
      this.onHitTintTimer -= dt;
      if (this.onHitTintTimer <= 0) {
        this.rect.setFillStyle(this.isBoss ? this.rect.fillColor : ENEMIES.color);
      }
    }
  }

  hit(dmg) {
    this.hp -= dmg;
    this.onHitTintTimer = 0.08;
    // Briefly brighten on hit
    this.rect.setFillStyle(0xff6b6b);
    return this.hp <= 0;
  }
}

