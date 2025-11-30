import { circleIntersectsAabb } from "../utils/MathUtil.js";

export class AoEPool {
    constructor(scene) {
        this.scene = scene;
        this.maxPool = 20;
        this.pool = [];
        this.active = [];

        for (let i = 0; i < this.maxPool; i++) {
            const g = scene.add.graphics();
            g.setDepth(5);
            g.setVisible(false);
            this.pool.push({
                id: i,
                g: g,
                active: false,
                x: 0, y: 0,
                radius: 0,
                maxRadius: 0,
                duration: 0,
                elapsed: 0,
                damage: 0,
                type: '',
                hitList: new Set(), // Track enemies hit per pulse
                options: {}
            });
        }
    }

    spawn(x, y, options = {}) {
        const item = this.pool.find(i => !i.active);
        if (!item) return;

        item.active = true;
        item.x = x;
        item.y = y;
        item.type = options.type;
        item.damage = options.damage;
        item.maxRadius = options.radius;
        item.duration = options.duration;
        item.elapsed = 0;
        item.hitList.clear();
        item.options = options;

        item.g.setVisible(true);
        item.g.clear();

        this.active.push(item);
    }

    update(dt) {
        for (let i = this.active.length - 1; i >= 0; i--) {
            const item = this.active[i];
            item.elapsed += dt;

            const progress = Math.min(1, item.elapsed / item.duration);

            // Update Logic
            if (item.type === 'sunflare') {
                // Expanding ring
                item.radius = item.maxRadius * progress;
                this._checkCollisions(item);
                this._drawSunflare(item, progress);
            } else if (item.type === 'frost_nova') {
                // Instant burst then fade
                item.radius = item.maxRadius; // Instant full size? Or expanding fast? Let's say expanding fast.
                // Actually spec says "Instantly triggers a circular shockwave".
                // But let's animate it slightly.
                item.radius = item.maxRadius * Math.min(1, progress * 4); // Expands in 25% of duration

                // Only hit once
                if (item.elapsed < 0.2) { // Active damage window
                    this._checkCollisions(item);
                }
                this._drawFrostNova(item, progress);
            }

            if (item.elapsed >= item.duration) {
                this._despawn(item);
                this.active.splice(i, 1);
            }
        }
    }

    _checkCollisions(item) {
        const enemies = this.scene.enemyPool.active;
        for (const e of enemies) {
            if (!e.alive) continue;
            if (item.hitList.has(e.id)) continue; // Already hit this activation

            const dx = e.pos.x - item.x;
            const dy = e.pos.y - item.y;
            const distSq = dx * dx + dy * dy;
            const combinedRadius = item.radius + e.radius;

            if (distSq <= combinedRadius * combinedRadius) {
                // Hit!
                // For Sunflare, it hits as the ring passes.
                // Simple check: if inside current radius.
                // A more precise check would be if distance is between inner and outer radius of ring.
                // For now, simple circle check.

                const isCrit = Math.random() < (item.options.critChance || 0);
                const mult = isCrit ? 1.5 : 1; // Default crit mult if not passed
                const dmg = item.damage * mult;

                e.hit(dmg);
                if (e.hp <= 0) this.scene._killEnemy(e);

                this.scene._damageNumber(e.pos.x, e.pos.y - 15, dmg, isCrit);

                // Effects
                if (item.options.knockback) {
                    const len = Math.sqrt(distSq) || 1;
                    e.push(dx / len * item.options.knockback, dy / len * item.options.knockback);
                }

                if (item.type === 'frost_nova') {
                    // Apply slow (mockup)
                    e.speedMult = 0.5;
                    // Reset speed after duration? Enemy class needs status support.
                    // For now, just direct property hack or ignore if not supported.
                    if (e.applyStatus) e.applyStatus('slow', item.duration, item.options.statusPotency);
                }

                item.hitList.add(e.id);
            }
        }
    }

    _drawSunflare(item, progress) {
        const g = item.g;
        g.clear();
        const alpha = 1 - progress;
        g.lineStyle(4, 0xffaa00, alpha);
        g.strokeCircle(item.x, item.y, item.radius);
        g.fillStyle(0xffaa00, alpha * 0.2);
        g.fillCircle(item.x, item.y, item.radius);
    }

    _drawFrostNova(item, progress) {
        const g = item.g;
        g.clear();
        const alpha = 1 - progress;
        g.fillStyle(0x00ffff, alpha * 0.5);
        g.fillCircle(item.x, item.y, item.radius);
        g.lineStyle(2, 0xffffff, alpha);
        g.strokeCircle(item.x, item.y, item.radius);
    }

    _despawn(item) {
        item.active = false;
        item.g.setVisible(false);
    }
}
