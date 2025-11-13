import Phaser from 'phaser';
import { GAME, WORLD, INPUT, OBSTACLES, ENEMIES, PLAYER, PROJECTILES } from "../config.js";
import { PlayerController } from "../entities/Player.js";
import { SpatialGrid } from "../systems/SpatialGrid.js";
import { RNG } from "../utils/RNG.js";
import { clamp, vec2, vec2Normalize, aabbIntersects, aabbOverlapX, aabbOverlapY } from "../utils/MathUtil.js";
import { EnemyPool } from "../pools/EnemyPool.js";
import { ProjectilePool } from "../pools/ProjectilePool.js";
import { XPOrbPool } from "../pools/XPOrbPool.js";
import { Upgrades, pickDraft, createLaneCounters } from "../systems/Upgrades.js";
import { LevelUpUI } from "../ui/LevelUpUI.js";
import { resolveShot } from "../systems/Stats.js";

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });

    this.accumulator = 0;
    this.smoothedDir = { x: 0, y: 0 };
    this.tmpDir = { x: 0, y: 0 };

    // Debug toggles
    this.debugCulling = false;
    this.debugCollisions = false;
    this.debugProjectiles = false;
    this.debugXP = false;

    // Level-up state
    this.levelUpActive = false;
    this.pendingLevelUps = 0;
    this.rerollsLeft = 5;
    this.draftRng = new RNG((Date.now() ^ 0xabad1dea) | 0);
    this.levelUpUI = null;

    // Pause state
    this.gamePaused = false;
    this._pausedByUser = false;

    // Game timer (seconds), events, difficulty
    this.totalTime = 10 * 60;
    this.remainingTime = this.totalTime;
    this.eventsFired = new Set();
    this.difficultyLevel = 0;
    this._portal = null; // {sprite, x, y, radius}
    this._finalBossAlive = false;
    this._padStartPrev = false;

    // Player contact damage cooldown (interval between ticks when touching enemies)
    this.playerContactInterval = 0.35; // seconds between damage ticks
    this.playerContactTimer = 0;

    // Track whether player is currently providing directional input
    this._hasMoveInput = false;
    // SFX gating to avoid stacks in the same moment
    this._lastDieSfxAt = 0;
  }

  create() {
    // World bounds and camera config
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBackgroundColor(GAME.backgroundColor);

    // Layers
    this.bgLayer = this.add.layer();
    this.obstacleLayer = this.add.layer();
    this.entityLayer = this.add.layer();

    // Player spawn at world center
    this.player = new PlayerController(this, WORLD.width / 2, WORLD.height / 2);
    this.entityLayer.add(this.player.rect);

    // Camera follow with slight lerp for smoothness
    this.cameras.main.startFollow(this.player.rect, false, 0.12, 0.12);
    // Pixel-perfect camera movement
    this.cameras.main.roundPixels = true;

    // Input setup
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
      ONE: Phaser.Input.Keyboard.KeyCodes.ONE,
      TWO: Phaser.Input.Keyboard.KeyCodes.TWO,
      THREE: Phaser.Input.Keyboard.KeyCodes.THREE,
      FOUR: Phaser.Input.Keyboard.KeyCodes.FOUR,
      FIVE: Phaser.Input.Keyboard.KeyCodes.FIVE,
      SIX: Phaser.Input.Keyboard.KeyCodes.SIX,
      SEVEN: Phaser.Input.Keyboard.KeyCodes.SEVEN,
      EIGHT: Phaser.Input.Keyboard.KeyCodes.EIGHT,
      F1: Phaser.Input.Keyboard.KeyCodes.F1,
      F2: Phaser.Input.Keyboard.KeyCodes.F2,
      F5: Phaser.Input.Keyboard.KeyCodes.F5,
      F6: Phaser.Input.Keyboard.KeyCodes.F6,
      B: Phaser.Input.Keyboard.KeyCodes.B,
      P: Phaser.Input.Keyboard.KeyCodes.P,
      E: Phaser.Input.Keyboard.KeyCodes.E,
      ESC: Phaser.Input.Keyboard.KeyCodes.ESC,
      OEM_4: Phaser.Input.Keyboard.KeyCodes.OEM_4,  // [
      OEM_6: Phaser.Input.Keyboard.KeyCodes.OEM_6,  // ]
      OEM_1: Phaser.Input.Keyboard.KeyCodes.OEM_1,  // ;
      QUOTE: Phaser.Input.Keyboard.KeyCodes.QUOTE,  // '
      COMMA: Phaser.Input.Keyboard.KeyCodes.COMMA,  // ,
      PERIOD: Phaser.Input.Keyboard.KeyCodes.PERIOD,// .
      MINUS: Phaser.Input.Keyboard.KeyCodes.MINUS,  // -
      SLASH: Phaser.Input.Keyboard.KeyCodes.SLASH,  // /
    });

    if (this.input && this.input.gamepad) {
      this.input.gamepad.once('connected', (pad) => { this.pad = pad; });
      // If a pad is already connected before scene starts, grab the first one.
      const pads = this.input.gamepad.pads || [];
      for (let i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].connected) { this.pad = pads[i]; break; }
      }
    }

    // Background grid texture (static)
    this._createGridTexture();
    const tilesX = Math.ceil(WORLD.width / 128);
    const tilesY = Math.ceil(WORLD.height / 128);
    for (let y = 0; y < tilesY; y++) {
      for (let x = 0; x < tilesX; x++) {
        const img = this.add.image(x * 128 + 64, y * 128 + 64, 'grid-128');
        img.setDepth(0);
        this.bgLayer.add(img);
      }
    }

    // Obstacles + grid
    this.obstacles = [];
    this.obstacleGrid = new SpatialGrid(OBSTACLES.cellSize);
    this._generateObstacles();

    // Enemy/Projectile/XP systems
    this.enemyPool = new EnemyPool(this);
    this.projectiles = new ProjectilePool(this);
    this.xpOrbs = new XPOrbPool(this);
    this.enemyGrid = new SpatialGrid(64);

    // Debug graphics overlay reused each frame
    this.debugGfx = this.add.graphics().setDepth(100);

    // Send player reference to UI scene
    this.game.events.emit("hud:set-player", this.player);

    // Initialize stats counters for upgrades
    this.player.statsCounters = createLaneCounters();

    // React to level-ups
    this.events.on('player:levelup', () => {
      if (this.levelUpActive) { this.pendingLevelUps++; return; }
      this._openLevelUpDraft();
    });

    // Difficulty shrines
    this._spawnDifficultyShrines(6);

    // Small onboarding enemies to demonstrate combat loop
    for (let i = 0; i < 2; i++) this.enemyPool.spawnAround(this.player.pos);

    // Debug text overlay for tuning readout
    this.debugText = this.add.text(8, 40, "", { fontFamily: 'monospace', fontSize: 10, color: '#dddddd' })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  _createGridTexture() {
    const g = this.add.graphics();
    g.clear();
    g.fillStyle(0x202428, 1);
    g.fillRect(0, 0, 128, 128);
    g.lineStyle(1, 0x1a1d20, 1);
    for (let i = 0; i <= 128; i += 32) {
      g.lineBetween(i, 0, i, 128);
      g.lineBetween(0, i, 128, i);
    }
    g.generateTexture('grid-128', 128, 128);
    g.destroy();
  }

  _generateObstacles() {
    // Generate a reproducible scatter of trees (triangles) and rocks (rectangles)
    const rng = new RNG(0xdecafbad);
    const count = rng.int(OBSTACLES.minCount, OBSTACLES.maxCount);

    // Bake a small triangle texture for trees to avoid heavy Graphics per instance
    this._createTreeTextures();

    const placed = [];
    const triesMax = 6;
    for (let i = 0; i < count; i++) {
      const isTree = rng.next() < 0.6;
      const w = isTree ? rng.int(48, 64) : rng.int(64, 96);
      const h = isTree ? rng.int(48, 64) : rng.int(32, 64);
      let x, y, ok = false;
      for (let t = 0; t < triesMax; t++) {
        x = rng.int(0, WORLD.width);
        y = rng.int(0, WORLD.height);
        const aabb = { x: x - w / 2, y: y - h / 2, w, h };
        // Avoid near player start
        const dx = x - WORLD.width / 2;
        const dy = y - WORLD.height / 2;
        if (dx * dx + dy * dy < 300 * 300) continue;
        // Simple overlap test against a few recent placed (not O(n^2))
        let overlap = false;
        for (let j = Math.max(0, placed.length - 50); j < placed.length; j++) {
          const p = placed[j];
          if (aabb.x < p.x + p.w && aabb.x + aabb.w > p.x && aabb.y < p.y + p.h && aabb.y + aabb.h > p.y) {
            overlap = true; break;
          }
        }
        if (!overlap) { ok = true; placed.push(aabb); break; }
      }
      if (!ok) continue;

      const aabb = { x: x - w / 2, y: y - h / 2, w, h };
      const obj = { id: i, kind: isTree ? 'tree' : 'rock', x, y, w, h, aabb, solid: true };
      if (obj.kind === 'tree') {
        const img = this.add.image(x, y, rng.next() < 0.5 ? 'tree-1' : 'tree-2');
        img.setTint(OBSTACLES.treeColor);
        img.setDepth(2);
        obj.display = img;
      } else {
        const r = this.add.rectangle(x, y, w, h, OBSTACLES.rockColor).setOrigin(0.5, 0.5);
        r.setDepth(1);
        obj.display = r;
      }
      this.obstacles.push(obj);
      this.obstacleLayer.add(obj.display);
    }

    // Insert into spatial grid
    this.obstacleGrid.clear();
    for (const o of this.obstacles) this.obstacleGrid.insert(o, o.aabb);
  }

  _createTreeTextures() {
    const makeTree = (key, baseW, baseH) => {
      const g = this.add.graphics();
      g.clear();
      g.fillStyle(0xffffff, 1);
      g.beginPath();
      // triangle pointing up
      g.moveTo(baseW / 2, 0);
      g.lineTo(baseW, baseH);
      g.lineTo(0, baseH);
      g.closePath();
      g.fillPath();
      g.generateTexture(key, baseW, baseH);
      g.destroy();
    };
    if (!this.textures.exists('tree-1')) makeTree('tree-1', 48, 48);
    if (!this.textures.exists('tree-2')) makeTree('tree-2', 64, 56);
  }

  _readInputDir() {
    let x = 0, y = 0;
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const up = this.cursors.up.isDown || this.keys.W.isDown;
    const down = this.cursors.down.isDown || this.keys.S.isDown;
    if (left) x -= 1;
    if (right) x += 1;
    if (up) y -= 1;
    if (down) y += 1;

    // Gamepad left stick (no smoothing, with deadzone)
    if (this.pad) {
      const sx = this.pad.axes.length > 0 ? this.pad.axes[0].getValue() : 0;
      const sy = this.pad.axes.length > 1 ? this.pad.axes[1].getValue() : 0;
      const mag = Math.hypot(sx, sy);
      if (mag > INPUT.gamepadDeadzone) {
        x = sx; y = sy;
      }
    }

    // Normalize
    const len = Math.hypot(x, y);
    this._hasMoveInput = len > 0.0001;
    if (len > 0) { x /= len; y /= len; }
    return { x, y };
  }

  _handleHotkeys() {
    // Debug toggles
    Phaser.Input.Keyboard.JustDown(this.keys.F1) && (this.debugCulling = !this.debugCulling);
    Phaser.Input.Keyboard.JustDown(this.keys.F2) && (this.debugCollisions = !this.debugCollisions);
    Phaser.Input.Keyboard.JustDown(this.keys.F5) && (this.debugProjectiles = !this.debugProjectiles);
    Phaser.Input.Keyboard.JustDown(this.keys.F6) && (this.debugXP = !this.debugXP);

    // Pause toggle via ESC (and gamepad start if connected)
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this._pausedByUser = !this._pausedByUser;
      this.gamePaused = this._pausedByUser || this.levelUpActive;
      if (this.gamePaused) this.tweens.pauseAll(); else this.tweens.resumeAll();
    }
    if (this.pad) {
      const startPressed = this.pad.buttons && this.pad.buttons[9] && this.pad.buttons[9].pressed;
      if (startPressed && !this._padStartPrev) {
        this._pausedByUser = !this._pausedByUser;
        this.gamePaused = this._pausedByUser || this.levelUpActive;
      }
      this._padStartPrev = !!startPressed;
    }

    // Tuning hotkeys (from milestone 1): [/] maxSpeed, ;/' accel, ,/. friction, -/ slash smoothingK
    if (Phaser.Input.Keyboard.JustDown(this.keys.OEM_4) || Phaser.Input.Keyboard.JustDown(this.keys.ONE)) this.player.baseMaxSpeed = Math.max(10, this.player.baseMaxSpeed - 10);
    if (Phaser.Input.Keyboard.JustDown(this.keys.OEM_6) || Phaser.Input.Keyboard.JustDown(this.keys.TWO)) this.player.baseMaxSpeed = Math.min(2000, this.player.baseMaxSpeed + 10);
    if (Phaser.Input.Keyboard.JustDown(this.keys.OEM_1) || Phaser.Input.Keyboard.JustDown(this.keys.THREE)) this.player.accel = Math.max(0, this.player.accel - 50);
    if (Phaser.Input.Keyboard.JustDown(this.keys.QUOTE) || Phaser.Input.Keyboard.JustDown(this.keys.FOUR)) this.player.accel = Math.min(10000, this.player.accel + 50);
    if (Phaser.Input.Keyboard.JustDown(this.keys.COMMA) || Phaser.Input.Keyboard.JustDown(this.keys.FIVE)) this.player.friction = Math.max(0, this.player.friction - 50);
    if (Phaser.Input.Keyboard.JustDown(this.keys.PERIOD) || Phaser.Input.Keyboard.JustDown(this.keys.SIX)) this.player.friction = Math.min(10000, this.player.friction + 50);
    if (Phaser.Input.Keyboard.JustDown(this.keys.MINUS) || Phaser.Input.Keyboard.JustDown(this.keys.SEVEN)) INPUT.smoothingK = Math.max(0, INPUT.smoothingK - 0.05);
    if (Phaser.Input.Keyboard.JustDown(this.keys.SLASH) || Phaser.Input.Keyboard.JustDown(this.keys.EIGHT)) INPUT.smoothingK = Math.min(1, INPUT.smoothingK + 0.05);

    // Enemy burst for stress testing
    if (Phaser.Input.Keyboard.JustDown(this.keys.B)) {
      for (let i = 0; i < 30; i++) this.enemyPool.spawnAround(this.player.pos);
    }
    // Manual projectile volley for testing
    if (Phaser.Input.Keyboard.JustDown(this.keys.P)) {
      // Fire a test volley in the last aim direction using resolved stats (ignores cooldown)
      const baseWeapon = { damage: this.player.baseProjDamage, speed: this.player.baseProjSpeed, lifetime: this.player.baseProjLifetime, cooldown: this.player.baseFireCooldown, amount: this.player.baseProjectilesPerVolley, size: 1.0, pierce: 0, critChance: 0 };
      const resolved = resolveShot(baseWeapon, this.player.stats);
      const radius = PROJECTILES.radius * resolved.size;
      const dir = this.player.lastAimDir.x || this.player.lastAimDir.y ? this.player.lastAimDir : { x: 1, y: 0 };
      for (let i = 0; i < resolved.amount; i++) {
        this.projectiles.spawn(
          this.player.pos.x,
          this.player.pos.y,
          dir.x * resolved.speed,
          dir.y * resolved.speed,
          resolved.damage,
          resolved.lifetime,
          { collidesTerrain: true, radius, critChance: resolved.critChance, critMult: resolved.critMult, pierce: resolved.pierce }
        );
      }
    }

    // Interactions (E): portal activation and shrine difficulty increase
    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      this._tryInteract();
    }
  }

  // Finds nearest enemy within a scan radius; returns the enemy or null.
  _findNearestEnemy(x, y, radius = 900) {
    let best = null, bestD2 = radius * radius;
    for (let i = 0; i < this.enemyPool.active.length; i++) {
      const e = this.enemyPool.active[i];
      if (!e.alive) continue;
      const dx = e.pos.x - x, dy = e.pos.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
  }

  // Returns up to maxCount nearest enemies within radius, sorted by distance ascending.
  _findNearestEnemies(x, y, radius = 900, maxCount = 3) {
    const res = [];
    const r2 = radius * radius;
    for (let i = 0; i < this.enemyPool.active.length; i++) {
      const e = this.enemyPool.active[i];
      if (!e.alive) continue;
      const dx = e.pos.x - x, dy = e.pos.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) res.push({ e, d2 });
    }
    res.sort((a, b) => a.d2 - b.d2);
    const out = [];
    for (let i = 0; i < res.length && out.length < maxCount; i++) out.push(res[i].e);
    return out;
  }

  _projectileEnemyCollisions() {
    // O(N*M) narrowphase; with pierce support and simple per-frame de-dupe.
    for (let id = 0; id < this.projectiles.alive.length; id++) {
      if (!this.projectiles.alive[id]) continue;
      const p = this.projectiles.pos[id];
      const r = this.projectiles.radius[id];
      let remaining = this.projectiles.hitsLeft ? this.projectiles.hitsLeft[id] : 1;
      if (remaining <= 0) remaining = 1; // safety
      const hitThisFrame = new Set();
      for (let i = 0; i < this.enemyPool.active.length; i++) {
        if (!this.projectiles.alive[id]) break; // might despawn mid-loop
        const e = this.enemyPool.active[i];
        if (!e.alive || hitThisFrame.has(e)) continue;
        const dx = e.pos.x - p.x, dy = e.pos.y - p.y;
        const rr = r + e.radius;
        if (dx * dx + dy * dy <= rr * rr) {
          // Apply crit and damage (single roll, shared by damage + visuals)
          const cc = this.projectiles.critChance[id] || 0;
          const cm = this.projectiles.critMult[id] || 2;
          const roll = Math.random();
          const isCrit = roll < cc;
          let dmg = this.projectiles.damage[id] * (isCrit ? cm : 1);
          // Clamp to max single-hit damage
          dmg = Math.min(999, Math.max(0, dmg));
          const dead = e.hit(dmg);
          if (dead) this._killEnemy(e);
          // Hit feedback: small particle burst + sprite-based damage numbers
          this._spawnHitParticles(p.x, p.y, isCrit);
          this._damageNumber(p.x, p.y - 10, Math.round(dmg), isCrit);
          hitThisFrame.add(e);
          remaining--;
          if (this.projectiles.hitsLeft) this.projectiles.hitsLeft[id] = remaining;
          if (remaining <= 0) { this.projectiles.despawn(id); break; }
        }
      }
    }
  }

  preload() {
    // Damage numbers spritesheet: 2 rows (0: white, 1: yellow crit), 10 columns (0-9)
    if (!this.textures.exists('bignums')) {
      this.load.spritesheet('bignums', 'assets/sprites/fonts/big-big-nums-1.png', {
        frameWidth: 17,
        frameHeight: 31,
      });
    }
    // Audio SFX (served from public/ at /assets/...)
    this.load.audio('sfx_hoard', '/assets/sfx/SFX-000-Hoard-Spawn.mp3');
    this.load.audio('sfx_shoot', '/assets/sfx/SFX-001-Player-Projectile-01.mp3');
    this.load.audio('sfx_die',   '/assets/sfx/SFX-002-Enemy-Dies.mp3');
  }

  _killEnemy(enemy) {
    // Spawn an XP orb; value based on difficulty and timer
    let value = this._xpValueForKill();
    if (enemy.isBoss) value += 3;
    if (enemy.isFinal) value += 6;
    // Drop multiple orbs if value is high
    while (value > 3) { this.xpOrbs.spawn(enemy.pos.x, enemy.pos.y, 3); value -= 3; }
    this.xpOrbs.spawn(enemy.pos.x, enemy.pos.y, Math.max(1, value));
    // Play enemy die SFX with horizontal panning relative to screen center
    const now = this.time.now || 0;
    if (now - this._lastDieSfxAt > 50) {
      const cam = this.cameras.main;
      const view = cam.worldView;
      const cx = view.x + view.width * 0.5;
      let pan = 0;
      if (enemy.pos.x < view.x) pan = -1;
      else if (enemy.pos.x > view.x + view.width) pan = 1;
      else pan = Phaser.Math.Clamp((enemy.pos.x - cx) / (view.width * 0.5), -1, 1);
      const snd = this.sound.add('sfx_die');
      snd.setVolume(0.7);
      if (snd.setPan) snd.setPan(pan);
      snd.once('complete', () => snd.destroy());
      snd.play();
      this._lastDieSfxAt = now;
    }
    this.enemyPool.release(enemy);
    if (enemy.isFinal) {
      this._finalBossAlive = false;
      this._showEndBanner('Victory!');
      this.gamePaused = true;
    }
  }

  _xpValueForKill() {
    // Difficulty and time progress influence orb tier probabilities
    const elapsed = this.totalTime - Math.max(0, this.remainingTime);
    const minutes = elapsed / 60;
    const d = this.difficultyLevel;
    const p3 = Math.min(0.05 + 0.02 * d + 0.01 * minutes, 0.35);
    const p2 = Math.min(0.20 + 0.03 * d + 0.02 * minutes, 0.7);
    const r = Math.random();
    if (r < p3) return 3;
    if (r < p3 + p2) return 2;
    return 1;
  }

  _spawnHitParticles(x, y, crit = false) {
    // Create a tiny neon texture on the fly if missing
    if (!this.textures.exists('p')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2).generateTexture('p', 2, 2); g.destroy();
    }
    const color = crit ? 0xfff275 : 0x00e5ff;
    // In Phaser 3.90, add.particles(x, y, texture, config) returns a ParticleEmitter directly
    const emitter = this.add.particles(x, y, 'p', {
      speed: { min: 30, max: 120 },
      angle: { min: 0, max: 360 },
      lifespan: 250,
      quantity: 8,
      gravityY: 0,
      scale: { start: 1, end: 0 },
      tint: color,
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD'
    });
    this.time.delayedCall(80, () => emitter.stop());
    // Clean up the underlying manager shortly after
    this.time.delayedCall(500, () => { if (emitter.manager) emitter.manager.destroy(); });
  }

  _floatText(x, y, text, color = 0xffffff) {
    const t = this.add.text(x, y, text, { fontFamily:'monospace', fontSize: 10, color: '#ffffff' }).setOrigin(0.5).setDepth(1000);
    t.setTint(color);
    this.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 600, ease: 'cubic.out', onComplete: () => t.destroy() });
  }

  _damageNumber(x, y, value, isCrit = false, isPlayer = false, isHeal = false) {
    // If spritesheet missing, fallback to text
    if (!this.textures.exists('bignums')) { this._floatText(x, y, String(value), isCrit ? 0xfff275 : 0xffffff); return; }
    const str = String(Math.max(0, value|0));
    const container = this.add.container(x, y).setDepth(1200);
    const scale = isCrit ? 0.8 : 0.6; // crits are slightly larger
    const digitW = 17 * scale;
    const totalW = str.length * digitW;
    const digits = [];
    for (let i = 0; i < str.length; i++) {
      const d = str.charCodeAt(i) - 48; // '0' -> 0
      const row = isHeal ? 3 : (isPlayer ? 2 : (isCrit ? 1 : 0));
      const frame = row * 10 + Phaser.Math.Clamp(d, 0, 9);
      const spr = this.add.image(-totalW/2 + i * digitW + digitW/2, 0, 'bignums', frame).setOrigin(0.5);
      spr.setScale(scale);
      spr.setBlendMode(Phaser.BlendModes.ADD);
      container.add(spr);
      digits.push(spr);
    }
    // Normal + player damage: shrink a bit more; Crits: pulse then shrink; Heals: wavy digits as it floats
    const duration = 900;
    const endScale = isCrit ? 0.92 : 0.82;
    const floatTween = this.tweens.add({
      targets: container,
      y: y - 24,
      alpha: 1, // we'll drive alpha manually below for a longer opaque hold
      scale: endScale,
      duration,
      ease: 'cubic.out',
      onUpdate: (tw, t) => {
        // keep opaque for the first ~30% of the life, then fade out
        const prog = tw.progress; // 0..1
        const fadeStart = 0.3;
        container.alpha = prog < fadeStart ? 1 : 1 - Math.min(1, (prog - fadeStart) / (1 - fadeStart));
        if (isHeal) {
          const prog = tw.progress; // 0..1
          // Wave: each digit oscillates vertically
          for (let i = 0; i < digits.length; i++) {
            const phase = prog * Math.PI * 6 + i * 0.8; // higher frequency
            digits[i].y = Math.sin(phase) * 4;          // larger amplitude
          }
        }
      },
      onComplete: () => container.destroy(),
    });
    if (isCrit) {
      // Quick pulse and color strobe for crits
      this.tweens.add({ targets: container, scaleX: scale*1.2, scaleY: scale*1.2, yoyo: true, duration: 140, repeat: 1 });
      this.tweens.addCounter({
        from: 0, to: 1, duration: 360, yoyo: true, repeat: 1,
        onUpdate: (tw) => {
          const v = tw.getValue();
          const c1 = Phaser.Display.Color.ValueToColor(0xfff275);
          const c2 = Phaser.Display.Color.ValueToColor(0xffffff);
          const c = Phaser.Display.Color.Interpolate.ColorWithColor(c1, c2, 1, v);
          const tint = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
          digits.forEach(s => s.setTint(tint));
        }
      });
    }
  }

  _showEndBanner(text) {
    const { width, height } = this.game.config;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(3000);
    const bg = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0, 0);
    const label = this.add.text(width/2, height/2, text, { fontFamily:'monospace', fontSize: 48, color:'#ffffff' }).setOrigin(0.5);
    c.add([bg, label]);
  }

  _enemyContactDamage(dt) {
    // Overlaps cause periodic damage ticks with a global interval
    let total = 0;
    for (let i = 0; i < this.enemyPool.active.length; i++) {
      const e = this.enemyPool.active[i];
      if (!e.alive || e.isSpawning || !e.canDamage) continue;
      const dx = e.pos.x - this.player.pos.x, dy = e.pos.y - this.player.pos.y;
      const rr = e.radius + 12; // cheap circle-vs-circle with player approx
      if (dx * dx + dy * dy <= rr * rr) {
        total++;
      }
    }
    this.playerContactTimer -= dt;
    if (total > 0 && this.playerContactTimer <= 0) {
      const dmg = Math.max(1, Math.round(3 * total)); // discrete hits per tick
      this.player.damage(dmg);
      this._damageNumber(this.player.pos.x, this.player.pos.y - 10, dmg, false, true);
      this.playerContactTimer = this.playerContactInterval;
    }
  }

  update(time, deltaMs) {
    this._handleHotkeys();
    const dt = Math.min(0.1, deltaMs / 1000);
    // Pause handling: do not advance accumulator or timer while paused or in level-up
    if (!(this.gamePaused || this.levelUpActive)) {
      this.accumulator += dt;
      this._updateGameTimer(dt);
    }

    // Run fixed update steps
    const step = GAME.fixedDt;
    while (this.accumulator >= step) {
      if (this.levelUpActive || this.gamePaused) break; // pause simulation
      const dir = this._readInputDir();
      // Apply derived stat effects each step
      this.player.maxSpeed = this.player.baseMaxSpeed * this.player.stats.moveSpeed;
      this.player.magnetRadius = PLAYER.magnetRadius * this.player.stats.magnet;
      this.player.step(step, dir, this.obstacleGrid, this.obstacles);
      // Enemies and auto-spawn
      this.enemyPool.autoSpawn(step, this.player.pos);
      this.enemyPool.update(step, this.player.pos);
      this._buildEnemyGrid();
      this._separateEnemies();
      this._resolvePlayerEnemyCollisions();
      // Player auto-fire and projectile updates
      this.player.tryAutoFire(step, (x, y) => this._findNearestEnemy(x, y, 900), this.projectiles);
      this.projectiles.update(step, this.obstacleGrid);
      // XP orbs update and pickups
      this.xpOrbs.update(step, this.player, (value) => this.player.addXP(value));
      // Collisions
      this._projectileEnemyCollisions();
      this._enemyContactDamage(step);
      this.accumulator -= step;
    }

    // Culling optimization for obstacles: toggle visibility based on camera view
    this._cullObstacles();
    // Refresh debug overlay
    this._drawDebug();

    // Update debug readout text
    const fps = this.game.loop.actualFps || 0;
    const lines = [
      `FPS: ${fps.toFixed(0)}`,
      `Time: ${this._formatTime(this.remainingTime)}  ${this.gamePaused ? '[PAUSED]' : ''}`,
      `Lv: ${this.player.level}  XP: ${this.player.xp}/${this.player.xpForNext}`,
      `Speed: ${this.player.maxSpeed.toFixed(0)}  Accel: ${this.player.accel.toFixed(0)}  Friction: ${this.player.friction.toFixed(0)}  SmoothK: ${INPUT.smoothingK.toFixed(2)}`,
      `Enemies: ${this.enemyPool.active.length}  Proj: ${this.projectiles.countActive}  Orbs: ${this.xpOrbs.countActive}  Diff: ${this.difficultyLevel}`,
    ];
    this.debugText.setText(lines.join('\n'));
  }

  _formatTime(t) {
    const sec = Math.max(0, Math.floor(t));
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  _updateGameTimer(dt) {
    const prev = this.remainingTime;
    this.remainingTime = Math.max(-600, this.remainingTime - dt); // allow negative for final swarm buildup
    // Fire scheduled events when crossing thresholds
    const ev = (tag, fn) => {
      if (this.eventsFired.has(tag)) return;
      fn(); this.eventsFired.add(tag);
    };
    // Use remainingTime thresholds (countdown)
    if (prev > 480 && this.remainingTime <= 480) ev('swarm1', () => this._spawnSwarm(60));
    if (prev > 300 && this.remainingTime <= 300) ev('boss1', () => this._spawnBoss());
    if (prev > 180 && this.remainingTime <= 180) ev('swarm2', () => this._spawnSwarm(80));
    if (prev > 90 && this.remainingTime <= 90) ev('portal', () => this._spawnPortal());
    if (prev > 30 && this.remainingTime <= 30) ev('boss2', () => this._spawnBoss());
    if (prev > 0 && this.remainingTime <= 0) ev('final_swarm', () => { this._finalSwarmStart = Date.now(); this._announce && this._announce('Final Swarm!'); });

    // After time reaches 0, escalate spawns each minute
    if (this.remainingTime <= 0) {
      const minutesPast = Math.floor((-this.remainingTime) / 60);
      if (!this._lastFinalMinute || minutesPast > this._lastFinalMinute) {
        this._lastFinalMinute = minutesPast;
        this._spawnSwarm(50 + minutesPast * 20);
      }
    }
  }

  _spawnSwarm(count) {
    for (let i = 0; i < count; i++) this.enemyPool.spawnAround(this.player.pos);
    this._announce && this._announce(`Swarm +${count}`);
  }

  _announce(text) {
    if (!this._announceContainer) {
      this._announceContainer = this.add.container(this.game.config.width/2, 24).setScrollFactor(0).setDepth(2500);
    }
    const t = this.add.text(0, 0, text, { fontFamily:'monospace', fontSize: 14, color:'#ffd166' }).setOrigin(0.5);
    t.setStroke('#000000', 4);
    this._announceContainer.add(t);
    t.alpha = 0;
    this.tweens.add({ targets: t, alpha: 1, duration: 150, yoyo: false, onComplete: () => {
      this.time.delayedCall(1100, () => {
        this.tweens.add({ targets: t, alpha: 0, y: t.y - 8, duration: 350, onComplete: () => t.destroy() });
      });
    }});
  }

  _spawnBoss() {
    const e = this.enemyPool.spawnAround(this.player.pos);
    if (!e) return;
    // Inflate boss stats
    e.hpMax = e.hp = ENEMIES.hp * 25;
    e.speed = ENEMIES.speed * 0.8;
    e.rect.width = ENEMIES.size * 2.0;
    e.rect.height = ENEMIES.size * 2.0;
    e.radius = (ENEMIES.size * 2.0) / 2;
    e.rect.setFillStyle(0x8a2be2); // purple
    e.isBoss = true;
    this._finalBossAlive = true;
    this._announce && this._announce('Boss Approaches');
  }

  _spawnPortal() {
    if (this._portal) return;
    const x = Math.random() * WORLD.width;
    const y = Math.random() * WORLD.height;
    const s = this.add.rectangle(x, y, 36, 36, 0x00d1b2).setOrigin(0.5).setDepth(3);
    this._portal = { sprite: s, x, y, radius: 48, active: true };
    this._announce && this._announce('Portal Revealed');
  }

  _openLevelUpDraft() {
    this.levelUpActive = true;
    this.gamePaused = true;
    this.tweens.pauseAll();
    const choices = pickDraft(this.draftRng, this.player.statsCounters, 3);
    // If no normal upgrades available, offer utility choices
    let finalChoices = choices;
    if (!choices || choices.length === 0) {
      finalChoices = [
        { id:'heal30', kind:'heal', tier:'rare', text:'Heal 30% HP', lanes:['heal'], healPct:0.30 },
        { id:'reroll1', tier:'common', text:'+1 Reroll', lanes:[], apply: () => { this.rerollsLeft++; } },
        { id:'heal10', kind:'heal', tier:'rare', text:'Heal 10% HP', lanes:['heal'], healPct:0.10 },
      ];
    }
    this.levelUpUI = new LevelUpUI(this, {
      choices: finalChoices,
      onChoose: (upg) => {
        // Handle heal-type cards immediately
        if (upg && upg.kind === 'heal' && upg.healPct) {
          const before = this.player.hp;
          this.player.hp = Math.min(this.player.hpMax, this.player.hp + this.player.hpMax * upg.healPct);
          const healed = Math.max(0, Math.round(this.player.hp - before));
          if (healed > 0) this._damageNumber(this.player.pos.x, this.player.pos.y - 14, healed, false, false /*isPlayer*/ , true);
        }
        // Apply stat upgrades if present
        if (typeof upg.apply === 'function') {
          upg.apply(this.player.stats);
        }
        for (const lane of (upg.lanes || [])) this.player.statsCounters[lane]++;
        this._closeLevelUpDraft();
      },
      onReroll: () => {
        if (this.rerollsLeft <= 0) return;
        this.rerollsLeft--;
        let newChoices = pickDraft(this.draftRng, this.player.statsCounters, 3);
        if (!newChoices || newChoices.length === 0) {
          newChoices = [
            { id:'heal30', kind:'heal', tier:'rare', text:'Heal 30% HP', lanes:['heal'], healPct:0.30 },
            { id:'reroll1', tier:'common', text:'+1 Reroll', lanes:[], apply: () => { this.rerollsLeft++; } },
            { id:'heal10', kind:'heal', tier:'rare', text:'Heal 10% HP', lanes:['heal'], healPct:0.10 },
          ];
        }
        this.levelUpUI.updateChoices(newChoices);
      },
      getRerollsLeft: () => this.rerollsLeft,
    });
  }

  _closeLevelUpDraft() {
    if (this.levelUpUI) { this.levelUpUI.destroy(); this.levelUpUI = null; }
    this.levelUpActive = false;
    this.gamePaused = this._pausedByUser; // resume if not user-paused
    if (!this.gamePaused) this.tweens.resumeAll();
    // If multiple level-ups queued, open next immediately
    if (this.pendingLevelUps > 0) { this.pendingLevelUps--; this._openLevelUpDraft(); }
  }

  _cullObstacles() {
    const cam = this.cameras.main;
    const pad = 128;
    const view = { x: cam.worldView.x - pad, y: cam.worldView.y - pad, w: cam.worldView.width + pad * 2, h: cam.worldView.height + pad * 2 };
    // Query candidates via grid
    const candidates = this.obstacleGrid.query(view, []);
    // Toggle visibility for candidates; simple approach sets others visible too, but to avoid massive loops
    // we only toggle candidates and assume off-camera items remain invisible after first pass.
    for (let i = 0; i < candidates.length; i++) {
      const o = candidates[i];
      const inside = !(o.aabb.x + o.aabb.w < view.x || o.aabb.x > view.x + view.w || o.aabb.y + o.aabb.h < view.y || o.aabb.y > view.y + view.h);
      o.display.setVisible(inside || !this.debugCulling);
    }
    if (!this._hasCulledOnce) {
      // First-time pass: hide everything not in view for performance
      const visibleSet = new Set(candidates);
      for (let i = 0; i < this.obstacles.length; i++) {
        const o = this.obstacles[i];
        if (!visibleSet.has(o)) o.display.setVisible(false);
      }
      this._hasCulledOnce = true;
    }
  }

  _drawDebug() {
    const g = this.debugGfx;
    g.clear();
    const cam = this.cameras.main;
    // Camera rect
    if (this.debugCulling) {
      g.lineStyle(1, 0xffffff, 0.6);
      g.strokeRect(cam.worldView.x, cam.worldView.y, cam.worldView.width, cam.worldView.height);
    }

    // Player HP text
    g.lineStyle(0);
    const hpPct = this.player.hp / this.player.hpMax;
    g.fillStyle(0x2ecc71, 0.8);
    g.fillRect(this.player.pos.x - 12, this.player.pos.y - 22, 24 * clamp(hpPct, 0, 1), 3);

    // Collision debug: draw player AABB and obstacle candidates near camera
    if (this.debugCollisions) {
      const a = this.player.getAabb();
      g.lineStyle(1, 0x00ffff, 0.8);
      g.strokeRect(a.x, a.y, a.w, a.h);
      const pad = 128;
      const view = { x: cam.worldView.x - pad, y: cam.worldView.y - pad, w: cam.worldView.width + pad * 2, h: cam.worldView.height + pad * 2 };
      const candidates = this.obstacleGrid.query(view, []);
      g.lineStyle(1, 0xffa500, 0.6);
      for (let i = 0; i < candidates.length; i++) {
        const o = candidates[i];
        g.strokeRect(o.aabb.x, o.aabb.y, o.aabb.w, o.aabb.h);
      }
    }

    if (this.debugProjectiles) {
      g.lineStyle(1, 0x4cc9f0, 0.8);
      for (let id = 0; id < this.projectiles.alive.length; id++) {
        if (!this.projectiles.alive[id]) continue;
        const p = this.projectiles.pos[id];
        const r = this.projectiles.radius[id];
        g.strokeCircle(p.x, p.y, r);
      }
    }

    if (this.debugXP) {
      g.lineStyle(1, 0x38b000, 0.8);
      g.strokeCircle(this.player.pos.x, this.player.pos.y, this.player.magnetRadius);
      g.strokeCircle(this.player.pos.x, this.player.pos.y, this.player.pickupRadius);
    }
  }

  _buildEnemyGrid() {
    if (!this.enemyGrid) return;
    this.enemyGrid.clear();
    for (let i = 0; i < this.enemyPool.active.length; i++) {
      const e = this.enemyPool.active[i];
      if (!e.alive) continue;
      const r = e.radius;
      this.enemyGrid.insert(e, { x: e.pos.x - r, y: e.pos.y - r, w: r * 2, h: r * 2 });
    }
  }

  _separateEnemies() {
    if (!this.enemyGrid) return;
    const tmp = [];
    for (let i = 0; i < this.enemyPool.active.length; i++) {
      const e = this.enemyPool.active[i];
      if (!e.alive) continue;
      const r = e.radius;
      const neigh = this.enemyGrid.query({ x: e.pos.x - r * 2, y: e.pos.y - r * 2, w: r * 4, h: r * 4 }, tmp);
      for (let j = 0; j < neigh.length; j++) {
        const o = neigh[j]; if (o === e || !o.alive) continue;
        const dx = e.pos.x - o.pos.x, dy = e.pos.y - o.pos.y;
        const dist = Math.hypot(dx, dy);
        const minDist = e.radius + o.radius;
        if (dist > 0 && dist < minDist) {
          const overlap = (minDist - dist) + 0.01;
          const ux = dx / dist, uy = dy / dist;
          const moveE = o.isSpawning ? 1.0 : 0.5;
          const moveO = e.isSpawning ? 0.0 : 0.5;
          e.pos.x += ux * overlap * moveE;
          e.pos.y += uy * overlap * moveE;
          o.pos.x -= ux * overlap * moveO;
          o.pos.y -= uy * overlap * moveO;
          e.rect.setPosition(e.pos.x, e.pos.y);
          o.rect.setPosition(o.pos.x, o.pos.y);
        }
      }
    }
  }

  _resolvePlayerEnemyCollisions() {
    const pr = 12; // approximate player radius
    for (let i = 0; i < this.enemyPool.active.length; i++) {
      const e = this.enemyPool.active[i];
      if (!e.alive || e.isSpawning) continue;
      // Use AABB contact to ensure no overlap between bodies
      const pa = this.player.getAabb();
      const er = e.radius;
      const ea = { x: e.pos.x - er, y: e.pos.y - er, w: er * 2, h: er * 2 };
      if (aabbIntersects(pa, ea)) {
        // Stop enemy motion on contact
        e.vel.x = 0; e.vel.y = 0;
        const mtvX = aabbOverlapX(pa, ea);
        const mtvY = aabbOverlapY(pa, ea);
        // Resolve along the smallest axis by splitting resolution between player and enemy
        if (Math.abs(mtvX) < Math.abs(mtvY)) {
          const half = mtvX * 0.5;
          // Move player by half (respecting terrain)
          this.player.resolveCollisions(this.obstacleGrid, this.obstacles, half, 0);
          // Move enemy by the other half (respecting terrain)
          if (typeof e.pushBy === 'function') e.pushBy(-half, 0, this.obstacleGrid);
          this.player.vel.x = 0; this.player.vel.y = 0;
        } else {
          const half = mtvY * 0.5;
          this.player.resolveCollisions(this.obstacleGrid, this.obstacles, 0, half);
          if (typeof e.pushBy === 'function') e.pushBy(0, -half, this.obstacleGrid);
          this.player.vel.x = 0; this.player.vel.y = 0;
        }
      }
    }
  }

  _spawnDifficultyShrines(n = 5) {
    this.shrines = [];
    for (let i = 0; i < n; i++) {
      const x = Math.random() * WORLD.width;
      const y = Math.random() * WORLD.height;
      const s = this.add.rectangle(x, y, 20, 20, 0xff00ff).setOrigin(0.5).setDepth(3);
      s.rotation = Math.PI / 4; // diamond
      const label = this.add.text(x, y - 18, 'E', { fontFamily:'monospace', fontSize: 10, color:'#ff99ff' }).setOrigin(0.5).setDepth(3);
      this.shrines.push({ x, y, sprite: s, label, radius: 36, active: true });
    }
  }

  _tryInteract() {
    // Portal activation
    if (this._portal && this._portal.active) {
      const dx = this._portal.x - this.player.pos.x;
      const dy = this._portal.y - this.player.pos.y;
      if (dx * dx + dy * dy <= this._portal.radius * this._portal.radius) {
        this._portal.active = false;
        this._portal.sprite.setVisible(false);
        this._spawnFinalBoss();
        return;
      }
    }
    // Difficulty shrines
    for (const sh of (this.shrines || [])) {
      if (!sh.active) continue;
      const dx = sh.x - this.player.pos.x;
      const dy = sh.y - this.player.pos.y;
      if (dx * dx + dy * dy <= sh.radius * sh.radius) {
        sh.active = false; sh.sprite.setVisible(false); sh.label.setVisible(false);
        this.difficultyLevel++;
        break;
      }
    }
  }

  _spawnFinalBoss() {
    const e = this.enemyPool.spawnAround(this.player.pos);
    if (!e) return;
    e.hpMax = e.hp = ENEMIES.hp * 80;
    e.speed = ENEMIES.speed * 0.9;
    e.rect.width = ENEMIES.size * 2.5;
    e.rect.height = ENEMIES.size * 2.5;
    e.radius = (ENEMIES.size * 2.5) / 2;
    e.rect.setFillStyle(0xff6b6b); // red boss
    e.isBoss = true;
    e.isFinal = true;
    this._finalBossAlive = true;
  }
}
