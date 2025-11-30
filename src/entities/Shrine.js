import { WORLD } from "../config.js";

export class Shrine {
    constructor(scene, x, y, id) {
        this.scene = scene;
        this.id = id;
        this.active = true;
        this.pos = { x, y };
        this.radius = 32;

        // Visuals
        this.container = scene.add.container(x, y).setDepth(4);

        // Base
        const base = scene.add.rectangle(0, 0, 40, 40, 0x444444);
        base.setStrokeStyle(2, 0x888888);

        // Pillar
        const pillar = scene.add.rectangle(0, -10, 20, 30, 0x666666);

        // Floating Orb (red for danger)
        this.orb = scene.add.circle(0, -35, 8, 0xff0000);

        // Text
        const text = scene.add.text(0, 15, "DANGER", {
            fontFamily: 'monospace', fontSize: 10, color: '#ff0000'
        }).setOrigin(0.5);

        this.container.add([base, pillar, this.orb, text]);

        // Tween orb
        scene.tweens.add({
            targets: this.orb,
            y: -40,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    update(dt) {
        if (!this.active) return;
        // Check player distance
        const p = this.scene.player;
        const dx = p.pos.x - this.pos.x;
        const dy = p.pos.y - this.pos.y;
        if (dx * dx + dy * dy < 60 * 60) {
            // Show prompt?
            // For now, interaction is handled by Scene 'E' key check
        }
    }

    tryInteract(player) {
        if (!this.active) return false;
        const dx = player.pos.x - this.pos.x;
        const dy = player.pos.y - this.pos.y;
        if (dx * dx + dy * dy < 60 * 60) {
            return this.interact();
        }
        return false;
    }

    interact() {
        if (!this.active) return false;

        this.active = false;
        this.scene.difficulty.addShrine();

        // Visual feedback
        this.orb.setFillStyle(0x555555); // Dimmed
        this.scene.tweens.add({
            targets: this.container,
            alpha: 0.5,
            duration: 500
        });

        // Reward
        this._grantReward();

        // SFX
        // this.scene.sound.play('sfx_shrine'); 

        return true;
    }

    _grantReward() {
        // Spawn a chest or just give direct reward?
        // Milestone says: "gives a reward (e.g. gold, chest, permanent stat buff)"
        // Let's drop a bunch of XP for now, or a "Chest" item.
        // Or just trigger a level up?
        // Let's spawn 5 large XP orbs.
        for (let i = 0; i < 5; i++) {
            this.scene.xpOrbs.spawn(this.pos.x + (Math.random() - 0.5) * 40, this.pos.y + (Math.random() - 0.5) * 40, 3);
        }
        this.scene._floatText(this.pos.x, this.pos.y - 50, "DANGER INCREASED!", 0xff0000);
    }
}
