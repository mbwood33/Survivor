// AABB ("axis-aligned bounding box"): Method used in video games for collision detection.
// Checks if an enemy's rectangular "bounding box," which is aligned with the x and y axes,
// overlaps with another object, like the player, to determine if they have collided.

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
    this.rect.setStrokeStyle(1, 0x000000, 0.8);
    this.rect.setDepth(5);
    this.rect.setVisible(false);
    this.hpBarBg = scene.add.rectangle(0, -ENEMIES.size*0.7, ENEMIES.size, 3, 0x111111).setOrigin(0.5).setVisible(false).setDepth(6);
    this.hpBarFg = scene.add.rectangle(0, -ENEMIES.size*0.7, ENEMIES.size, 3, 0xff2a6d).setOrigin(0.5).setVisible(false).setDepth(7);
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
    this.hpBarBg.setPosition(x, y - this.rect.height*0.7).setVisible(!!opts.isBoss);
    this.hpBarFg.setPosition(x, y - this.rect.height*0.7).setVisible(!!opts.isBoss);
    // Spawn animation: stationary and harmless until finished
    this.isSpawning = true;
    this.canDamage = false;
    this.rect.alpha = 0; this.rect.scaleY = 0.1;
    const dur = ENEMIES.spawnTimeMs || 500;
    if (this._spawnTween) { this._spawnTween.remove(); this._spawnTween = null; }
    this._spawnTween = this.scene.tweens.add({
      targets: this.rect,
      alpha: 1,
      scaleY: 1,
      duration: dur,
      onComplete: () => { this.isSpawning = false; this.canDamage = true; this._spawnTween = null; }
    });
    this.isBoss = false; this.isFinal = false;
    return this;
  }

  despawn() {
    this.alive = false;
    this.rect.setVisible(false);
    this.hpBarBg.setVisible(false);
    this.hpBarFg.setVisible(false);
    if (this._spawnTween) { this._spawnTween.remove(); this._spawnTween = null; }
  }

  update(dt, playerPos) {
    if (!this.alive) return;
    if (this.isSpawning) {
      // Align visuals during spawn
      this.rect.setPosition(this.pos.x, this.pos.y);
      if (this.hpBarBg.visible) {
        this.hpBarBg.setPosition(this.pos.x, this.pos.y - this.rect.height*0.7);
        this.hpBarFg.setPosition(this.pos.x, this.pos.y - this.rect.height*0.7);
      }
      return;
    }
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
    if (this.hpBarBg.visible) {
      const w = this.rect.width;
      const pct = Math.max(0, Math.min(1, this.hp / this.hpMax));
      this.hpBarBg.setPosition(this.pos.x, this.pos.y - this.rect.height*0.7);
      this.hpBarFg.setPosition(this.pos.x - w*(1-pct)/2, this.pos.y - this.rect.height*0.7).setSize(w * pct, 3);
    }

    if (this.onHitTintTimer > 0) {
      this.onHitTintTimer -= dt;
      if (this.onHitTintTimer <= 0) {
        this.rect.setFillStyle(this.isBoss ? this.rect.fillColor : ENEMIES.color);
      }
    }
  }

  // Push this enemy by a displacement while respecting world obstacles (axis-separated)
  pushBy(dx, dy, obstacleGrid) {
    if (!dx && !dy) return;
    const aabb = () => ({ x: this.pos.x + this.collider.ox, y: this.pos.y + this.collider.oy, w: this.collider.w, h: this.collider.h });
    const cur = aabb();
    const sweep = { x: Math.min(cur.x, cur.x + dx), y: Math.min(cur.y, cur.y + dy), w: cur.w + Math.abs(dx), h: cur.h + Math.abs(dy) };
    const candidates = obstacleGrid ? obstacleGrid.query(sweep, []) : [];
    const epsilon = 1e-6;
    if (dx) {
      this.pos.x += dx;
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
            any = true; a = aabb();
          }
        }
        if (!any) break;
      }
    }
    if (dy) {
      this.pos.y += dy;
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
            any = true; a = aabb();
          }
        }
        if (!any) break;
      }
    }
    this.rect.setPosition(this.pos.x, this.pos.y);
  }

  hit(dmg) {
    this.hp -= dmg;
    this.onHitTintTimer = 0.08;
    // Briefly brighten on hit
    this.rect.setFillStyle(0xff6b6b);
    return this.hp <= 0;
  }
}
