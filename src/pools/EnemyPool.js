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
    if (this.active.length >= ENEMIES.maxActive) return;
    const ang = Math.random() * Math.PI * 2;
    const dist = ENEMIES.spawnRadiusMin + Math.random() * (ENEMIES.spawnRadiusMax - ENEMIES.spawnRadiusMin);
    const x = playerPos.x + Math.cos(ang) * dist;
    const y = playerPos.y + Math.sin(ang) * dist;
    const e = this.obtain().spawn(x, y, opts);
    return e;
  }

  autoSpawn(dt, playerPos) {
    // Scale spawn intensity with difficulty and elapsed time
    const scene = this.scene;
    const elapsedMin = (scene.totalTime - Math.max(0, scene.remainingTime)) / 60;
    const intensity = 1 + scene.difficultyLevel * 0.2 + elapsedMin * 0.05 + (scene.remainingTime <= 0 ? 0.5 : 0);
    const rate = ENEMIES.spawnPerSecond * intensity;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer += Math.max(0.05, 1 / rate);
      const hpMult = 1 + scene.difficultyLevel * 0.3 + elapsedMin * 0.1;
      const speedMult = 1 + scene.difficultyLevel * 0.05 + elapsedMin * 0.02;
      this.spawnAround(playerPos, { hpMult, speedMult });
    }
  }
}
