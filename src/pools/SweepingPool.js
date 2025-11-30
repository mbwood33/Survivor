export class SweepingPool {
    constructor(scene) {
        this.scene = scene;
        this.maxPool = 10;
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
                angle: 0,
                arc: 0,
                radius: 0,
                duration: 0,
                elapsed: 0,
                damage: 0,
                type: '',
                hitList: new Set(),
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
        item.angle = options.angle || 0;
        item.arc = options.arc || Math.PI;
        item.radius = options.radius;
        item.duration = options.duration;
        item.elapsed = 0;
        item.hitList.clear();
        item.options = options;

        item.g.setVisible(true);
        this.active.push(item);
    }

    update(dt) {
        // Update player position tracking for attached sweeps?
        // Arc Blade usually moves with player.
        const player = this.scene.player;

        for (let i = this.active.length - 1; i >= 0; i--) {
            const item = this.active[i];
            item.elapsed += dt;
            const progress = item.elapsed / item.duration;

            if (item.type === 'arc_blade') {
                // Follow player
                item.x = player.pos.x;
                item.y = player.pos.y;
                this._checkCollisionsArc(item);
                this._drawArcBlade(item, progress);
            } else if (item.type === 'meteor_knuckle') {
                // Stationary explosion
                this._checkCollisionsCircle(item);
                this._drawMeteorKnuckle(item, progress);
            }

            if (item.elapsed >= item.duration) {
                this._despawn(item);
                this.active.splice(i, 1);
            }
        }
    }

    _checkCollisionsArc(item) {
        const enemies = this.scene.enemyPool.active;
        // Simple arc check: distance < radius AND angle within range
        const startAngle = item.angle - item.arc / 2;
        const endAngle = item.angle + item.arc / 2;

        for (const e of enemies) {
            if (!e.alive) continue;
            if (item.hitList.has(e.id)) continue;

            const dx = e.pos.x - item.x;
            const dy = e.pos.y - item.y;
            const distSq = dx * dx + dy * dy;
            const combinedRadius = item.radius + e.radius;

            if (distSq <= combinedRadius * combinedRadius) {
                // Check angle
                const angle = Math.atan2(dy, dx);
                // Normalize angles to 0-2PI or handle wrap around
                // Easiest: difference between angle and item.angle
                let diff = angle - item.angle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;

                if (Math.abs(diff) <= item.arc / 2) {
                    this._applyHit(item, e, dx, dy);
                }
            }
        }
    }

    _checkCollisionsCircle(item) {
        const enemies = this.scene.enemyPool.active;
        for (const e of enemies) {
            if (!e.alive) continue;
            if (item.hitList.has(e.id)) continue;
            const dx = e.pos.x - item.x;
            const dy = e.pos.y - item.y;
            const distSq = dx * dx + dy * dy;
            const combinedRadius = item.radius + e.radius;
            if (distSq <= combinedRadius * combinedRadius) {
                this._applyHit(item, e, dx, dy);
            }
        }
    }

    _applyHit(item, e, dx, dy) {
        const isCrit = Math.random() < (item.options.critChance || 0);
        const mult = isCrit ? 1.5 : 1;
        const dmg = item.damage * mult;

        e.hit(dmg);
        if (e.hp <= 0) this.scene._killEnemy(e);
        this.scene._damageNumber(e.pos.x, e.pos.y - 15, dmg, isCrit);

        if (item.options.knockback) {
            const len = Math.hypot(dx, dy) || 1;
            e.push(dx / len * item.options.knockback, dy / len * item.options.knockback);
        }
        item.hitList.add(e.id);
    }

    _drawArcBlade(item, progress) {
        const g = item.g;
        g.clear();
        const alpha = 1 - progress;
        g.lineStyle(2, 0xffffff, alpha);
        g.fillStyle(0xccffff, alpha * 0.5);

        g.beginPath();
        g.moveTo(item.x, item.y);
        g.arc(item.x, item.y, item.radius, item.angle - item.arc / 2, item.angle + item.arc / 2);
        g.closePath();
        g.fillPath();
        g.strokePath();
    }

    _drawMeteorKnuckle(item, progress) {
        const g = item.g;
        g.clear();
        const alpha = 1 - progress;
        g.fillStyle(0xff4400, alpha * 0.8);
        g.fillCircle(item.x, item.y, item.radius * (0.5 + 0.5 * progress)); // Expand slightly
    }

    _despawn(item) {
        item.active = false;
        item.g.setVisible(false);
    }
}
