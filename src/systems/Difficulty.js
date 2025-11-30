export class DifficultyState {
    constructor() {
        this.timeSeconds = 0;
        this.shrineCount = 0;
        this.danger = 1.0;

        // Constants from milestone
        this.base = 1.0;
        this.kLinear = 0.4;
        this.kQuadratic = 0.03;

        this.shrineStep = 0.30;
        this.shrineCurve = 0.05;
    }

    update(dt) {
        this.timeSeconds += dt;
        const t = this.timeSeconds / 60; // minutes

        const dangerBase = this.base + (this.kLinear * t) + (this.kQuadratic * t * t);

        // Shrine multiplier
        // fShrines(s) = s * step + s * s * curve
        const s = this.shrineCount;
        const dangerShrine = (s * this.shrineStep) + (s * s * this.shrineCurve);

        this.danger = dangerBase * (1 + dangerShrine);
    }

    addShrine() {
        this.shrineCount++;
    }

    // Helper to get scaled enemy HP
    getEnemyHp(baseHp) {
        const kHp = 0.12;
        const hpScaleExponent = 1.25;
        return baseHp * Math.pow(1 + kHp * this.danger, hpScaleExponent);
    }

    // Helper to get scaled enemy Damage
    getEnemyDamage(baseDmg) {
        const kDmg = 0.20;
        return baseDmg * (1 + kDmg * Math.sqrt(this.danger));
    }
}
