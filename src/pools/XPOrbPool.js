import { XP_ORBS } from "../config.js";

// Simple XP orb pool; orbs drift then are magnetized to player and collected.
export class XPOrbPool {
  constructor(scene) {
    this.scene = scene;
    this.max = XP_ORBS.maxPool;
    this.free = [];
    for (let i = 0; i < this.max; i++) this.free.push(i);
    this.alive = new Array(this.max).fill(false);
    this.pos = new Array(this.max).fill(0).map(() => ({ x: 0, y: 0 }));
    this.vel = new Array(this.max).fill(0).map(() => ({ x: 0, y: 0 }));
    this.value = new Int16Array(this.max);
    this.radius = new Float32Array(this.max).fill(XP_ORBS.radius);
    this.sprites = new Array(this.max);
    this.countActive = 0;

    for (let i = 0; i < this.max; i++) {
      const s = scene.add.circle(0, 0, XP_ORBS.radius, XP_ORBS.color);
      s.setVisible(false);
      s.setDepth(4);
      this.sprites[i] = s;
    }
  }

  spawn(x, y, value = 1) {
    // If pool exhausted, recycle the oldest active orb by value (simple fallback)
    let id = this.free.pop();
    if (id === undefined) {
      // pick any active id to recycle (start from 0)
      for (let i = 0; i < this.max; i++) { if (this.alive[i]) { id = i; break; } }
      if (id === undefined) return -1;
    }
    this.alive[id] = true;
    this.pos[id].x = x; this.pos[id].y = y;
    // small random drift
    const ang = Math.random() * Math.PI * 2;
    const spd = 20 + Math.random() * 30;
    this.vel[id].x = Math.cos(ang) * spd;
    this.vel[id].y = Math.sin(ang) * spd;
    this.value[id] = value;
    this.sprites[id].setPosition(x, y);
    // Color by value tier: 1=green, 2=blue, 3=gold
    const color = value >= 3 ? 0xf4d35e : value === 2 ? 0x4cc9f0 : XP_ORBS.color;
    this.sprites[id].setFillStyle(color);
    this.sprites[id].setVisible(true);
    if (this.free.length >= 0) this.countActive = this.alive.reduce((a,b)=>a+(b?1:0),0);
    return id;
  }

  despawn(id) {
    if (!this.alive[id]) return;
    this.alive[id] = false;
    this.sprites[id].setVisible(false);
    this.free.push(id);
    this.countActive--;
  }

  update(dt, player, collectCb) {
    const px = player.pos.x, py = player.pos.y;
    for (let id = 0; id < this.max; id++) {
      if (!this.alive[id]) continue;
      const p = this.pos[id];
      const v = this.vel[id];
      // Magnetize if inside magnet radius
      const dx = px - p.x, dy = py - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < player.magnetRadius && dist > 1e-5) {
        const ux = dx / dist, uy = dy / dist;
        v.x = ux * player.magnetPullSpeed;
        v.y = uy * player.magnetPullSpeed;
      } else {
        // slow drift damping
        v.x *= 0.98; v.y *= 0.98;
      }
      p.x += v.x * dt; p.y += v.y * dt;
      this.sprites[id].setPosition(p.x, p.y);

      // Collect inside pickup radius
      if (dist <= player.pickupRadius) {
        collectCb(this.value[id]);
        this.despawn(id);
      }
    }
  }
}
