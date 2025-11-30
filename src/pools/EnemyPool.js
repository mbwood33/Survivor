import Phaser from 'phaser';
import { ENEMIES } from "../config.js";
import { Enemy } from "../entities/Enemy.js";

// Manages a pool of reusable Enemy instances and simple spawning logic.
export class EnemyPool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    this.kills = 0;
    // Delay first spawn a bit to avoid initial burst when the game catches up fixed steps
    this.spawnTimer = 1 / ENEMIES.spawnPerSecond;
  }

  obtain() {
    const e = this.pool.pop() || new Enemy(this.scene);
    this.active.push(e);
    return e;
  }

  release(enemy) {
    const i = this.active.indexOf(enemy);
    if (i !== -1) this.active.splice(i, 1);
    enemy.despawn();
    this.pool.push(enemy);
  }

  update(dt, playerPos) {
    for (let i = 0; i < this.active.length; i++) {
      const e = this.active[i];
      e.update(dt, playerPos);
    }
  }

  spawnAround(playerPos, opts = {}) {
    if (!opts.ignoreCap && this.active.length >= ENEMIES.maxActive) return;
    // Spawn within on-screen annulus near the player, but not on top
    const cam = this.scene.cameras.main;
    const vw = cam.worldView;
    const pad = 40;
    const minDist = 100; // do not spawn closer than this to player
    const maxRadX = Math.max(0, vw.width / 2 - pad);
    const maxRadY = Math.max(0, vw.height / 2 - pad);
    let x, y;
    let tries = 12;
    do {
      const rx = (Math.random() * 2 - 1) * maxRadX;
      const ry = (Math.random() * 2 - 1) * maxRadY;
      x = Phaser.Math.Clamp(playerPos.x + rx, vw.x + pad, vw.x + vw.width - pad);
      y = Phaser.Math.Clamp(playerPos.y + ry, vw.y + pad, vw.y + vw.height - pad);
      tries--;
    } while (tries > 0 && ((x - playerPos.x) ** 2 + (y - playerPos.y) ** 2) < (minDist * minDist));
    const e = this.obtain().spawn(x, y, opts);
    return e;
  }

  autoSpawn(dt, playerPos) {
    // Scale spawn intensity with difficulty
    const scene = this.scene;
    const danger = scene.difficulty.danger;

    // Spawn interval shrinks as danger increases
    // base 1.0s, kSpawn 0.08
    const baseSpawnInterval = 1.0;
    const kSpawn = 0.08;
    const minSpawnInterval = 0.15;
    let spawnInterval = baseSpawnInterval / (1 + kSpawn * danger);
    spawnInterval = Math.max(spawnInterval, minSpawnInterval);

    // Max enemies
    const baseMaxEnemies = 40;
    const kMaxEnemies = 2.5;
    const maxEnemies = baseMaxEnemies + Math.floor(kMaxEnemies * danger);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer += spawnInterval;

      // Check cap
      if (this.active.length >= maxEnemies && scene.remainingTime > 0) return;

      // Stats scaling handled by DifficultyState, passed to spawn?
      // Actually Enemy.spawn usually takes opts.
      // Let's calculate multipliers or raw values here.
      // The milestone says: "When you spawn an enemy: Compute its current HP & damage using the formulas"

      // We'll pass the difficulty object or scaled stats to spawn
      // But Enemy.spawn signature is spawn(x, y, opts).
      // Let's pass 'danger' or let Enemy handle it?
      // Better to calculate here and pass explicit hp/damage overrides or multipliers.

      // But Enemy types have different base stats.
      // So we should pass the *scaling factors* or let the Enemy class use the DifficultyState if it has access.
      // Enemy has access to scene.

      // Let's pass a "difficultyScale" object or just let the enemy read from scene.difficulty?
      // The milestone says "Store those on the enemy instance".

      // Let's pass the difficulty instance to spawn, or just let it read scene.difficulty.
      this.spawnAround(playerPos);
    }
  }
}
