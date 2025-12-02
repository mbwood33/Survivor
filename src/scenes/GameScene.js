import Phaser from 'phaser';
import { GAME, WORLD, INPUT, OBSTACLES, ENEMIES, PLAYER, PROJECTILES } from "../config.js";
import { PlayerController } from "../entities/Player.js";
import { SpatialGrid } from "../systems/SpatialGrid.js";
import { RNG } from "../utils/RNG.js";
import { clamp, vec2, vec2Normalize, aabbIntersects, aabbOverlapX, aabbOverlapY } from "../utils/MathUtil.js";
import { EnemyPool } from "../pools/EnemyPool.js";
import { ProjectilePool } from "../pools/ProjectilePool.js";
import { XPOrbPool } from "../pools/XPOrbPool.js";
import { UpgradeManager, pickDraft } from "../systems/Upgrades.js";
import { LevelUpUI } from "../ui/LevelUpUI.js";
import { resolveShot } from "../systems/Stats.js";
import { WeaponManager } from "../systems/WeaponManager.js";
import { AoEPool } from "../pools/AoEPool.js";
import { SweepingPool } from "../pools/SweepingPool.js";
import { DifficultyState } from "../systems/Difficulty.js";
import { Shrine } from "../entities/Shrine.js";
import { MapGenerator } from "../systems/MapGenerator.js";

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
    this.difficulty = new DifficultyState();
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

  preload() {
    if (!this.textures.exists('bignums')) {
      this.load.spritesheet('bignums', 'assets/sprites/fonts/big-big-nums-1.png', { frameWidth: 17, frameHeight: 31 });
    }

    // Load tileset for procedural map
    this.load.image('tileset', 'assets/sprites/tiles/grass_tileset_16x16.png');

    this.load.audio('sfx_hoard', '/assets/sfx/SFX-000-Hoard-Spawn.mp3');
    this.load.audio('sfx_shoot', '/assets/sfx/SFX-001-Player-Projectile-01.mp3');
    this.load.audio('sfx_die', '/assets/sfx/SFX-002-Enemy-Dies.mp3');
    this.load.audio('sfx_hit', '/assets/sfx/SFX-003-Enemy-Hit.mp3');
    this.load.audio('sfx_crit', '/assets/sfx/SFX-004-Crit-Hit.mp3');
    this.load.audio('sfx_xp1', '/assets/sfx/SFX-005-XP-Orb-1.mp3');
    this.load.audio('sfx_xp2', '/assets/sfx/SFX-005-XP-Orb-2.mp3');
    this.load.audio('sfx_xp3', '/assets/sfx/SFX-005-XP-Orb-3.mp3');
    this.load.audio('bgm', '/assets/music/YEAH.ogg');
    this.load.audio('bgm_loop', '/assets/music/YEAH-loop.ogg');
  }

  create() {
    // World bounds and camera config
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBackgroundColor(GAME.backgroundColor);

    // Layers
    this.bgLayer = this.add.layer();
    this.obstacleLayer = this.add.layer();
    this.entityLayer = this.add.layer();

    // --- Procedural Map Generation ---
    const mapWidth = Math.ceil(WORLD.width / 16);
    const mapHeight = Math.ceil(WORLD.height / 16);
    const mapGen = new MapGenerator(mapWidth, mapHeight, 16);
    const { base, overlay } = mapGen.generate();

    // Create Tilemap (Blank)
    const map = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: mapWidth, height: mapHeight });
    const tileset = map.addTilesetImage('tileset', 'tileset', 16, 16, 0, 0);

    // Create Layers
    const baseLayer = map.createBlankLayer('base', tileset);
    const overlayLayer = map.createBlankLayer('overlay', tileset);

    // Populate Layers
    // Note: putTilesAt is efficient enough for this size
    baseLayer.putTilesAt(base, 0, 0);
    overlayLayer.putTilesAt(overlay, 0, 0);

    this.bgLayer.add([baseLayer, overlayLayer]);

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

    // Obstacles + grid
    this.obstacles = [];
    this.obstacleGrid = new SpatialGrid(OBSTACLES.cellSize);
    this._generateObstacles();

    // Enemy/Projectile/XP systems
    this.enemyPool = new EnemyPool(this);
    this.projectiles = new ProjectilePool(this);
    this.xpOrbs = new XPOrbPool(this);
    this.enemyGrid = new SpatialGrid(64);
    this.aoePool = new AoEPool(this);
    this.sweepingPool = new SweepingPool(this);
    this.weaponManager = new WeaponManager(this, this.player);
    this.upgradeManager = new UpgradeManager(this, this.player);

    // Give player initial weapon
    this.weaponManager.addWeapon('star_bolt');

    // Debug graphics overlay reused each frame
    this.debugGfx = this.add.graphics().setDepth(100);

    // Send player reference to UI scene
    this.game.events.emit("hud:set-player", this.player);

    // React to level-ups
    this.events.on('player:levelup', () => {
      if (this.levelUpActive) { this.pendingLevelUps++; return; }
      this._openLevelUpDraft();
    });

    // Difficulty shrines
    this.shrines = [];
    this._spawnDifficultyShrines(6);

    // Small onboarding enemies to demonstrate combat loop
    for (let i = 0; i < 2; i++) this.enemyPool.spawnAround(this.player.pos);

    // Debug text overlay for tuning readout
    this.debugText = this.add.text(8, 40, "", { fontFamily: 'monospace', fontSize: 10, color: '#dddddd' })
      .setScrollFactor(0)
      .setDepth(1000);

    // Initial debug text update
    this._updateDebugText();

    // Start BGM only after audio is unlocked
    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
        this._startBgm();
      });
    } else {
      this._startBgm();
    }

    // Launch UI overlay
    this.scene.launch('UIScene');
  }

  _generateObstacles() {
    const rng = new RNG(0xdecafbad);
    const count = rng.int(OBSTACLES.minCount, OBSTACLES.maxCount);
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
        const dx = x - WORLD.width / 2;
        const dy = y - WORLD.height / 2;
        if (dx * dx + dy * dy < 300 * 300) continue;
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
    this.obstacleGrid.clear();
    for (const o of this.obstacles) this.obstacleGrid.insert(o, o.aabb);
  }

  _createTreeTextures() {
    const makeTree = (key, baseW, baseH) => {
      const g = this.add.graphics();
      g.clear();
      g.fillStyle(0xffffff, 1);
      g.beginPath();
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

    if (this.pad) {
      const sx = this.pad.axes.length > 0 ? this.pad.axes[0].getValue() : 0;
      const sy = this.pad.axes.length > 1 ? this.pad.axes[1].getValue() : 0;
      const mag = Math.hypot(sx, sy);
      if (mag > INPUT.gamepadDeadzone) { x = sx; y = sy; }
    }

    const len = Math.hypot(x, y);
    this._hasMoveInput = len > 0.0001;
    if (len > 0) { x /= len; y /= len; }
    return { x, y };
  }

  _handleHotkeys() {
    Phaser.Input.Keyboard.JustDown(this.keys.F1) && (this.debugCulling = !this.debugCulling);
    Phaser.Input.Keyboard.JustDown(this.keys.F2) && (this.debugCollisions = !this.debugCollisions);
    Phaser.Input.Keyboard.JustDown(this.keys.F5) && (this.debugProjectiles = !this.debugProjectiles);
    Phaser.Input.Keyboard.JustDown(this.keys.F6) && (this.debugXP = !this.debugXP);

    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this._pausedByUser = !this._pausedByUser;
      this.gamePaused = this._pausedByUser || this.levelUpActive;
      if (this.gamePaused) this.tweens.pauseAll();
      else this.tweens.resumeAll();
      this._bgmTargetVolume = (this.gamePaused || this.levelUpActive) ? 0.4 : 1.0;
      this._updateBgmVolume();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      if (!this._tryInteractShrine()) {
        this._tryInteract();
      }
    }
  }

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

  _projectileEnemyCollisions() {
    for (let id = 0; id < this.projectiles.alive.length; id++) {
      if (!this.projectiles.alive[id]) continue;
      const p = this.projectiles.pos[id];
      const r = this.projectiles.radius[id];
      let remaining = this.projectiles.hitsLeft ? this.projectiles.hitsLeft[id] : 1;
      if (remaining <= 0) remaining = 1;
      const hitThisFrame = new Set();
      for (let i = 0; i < this.enemyPool.active.length; i++) {
        if (!this.projectiles.alive[id]) break;
        const e = this.enemyPool.active[i];
        if (!e.alive || hitThisFrame.has(e)) continue;
        const dx = e.pos.x - p.x, dy = e.pos.y - p.y;
        const rr = r + e.radius;
        if (dx * dx + dy * dy <= rr * rr) {
          const cc = this.projectiles.critChance[id] || 0;
          const cm = this.projectiles.critMult[id] || 2;
          const isCrit = Math.random() < cc;
          let dmg = this.projectiles.damage[id] * (isCrit ? cm : 1);
          dmg = Math.min(999, Math.max(0, dmg));
          const dead = e.hit(dmg);
          if (dead) this._killEnemy(e);
          this._spawnHitParticles(p.x, p.y, isCrit);
          this._damageNumber(p.x, p.y - 10, Math.round(dmg), isCrit);
          this.sound.play('sfx_hit', { volume: 0.4 });
          if (isCrit) this.sound.play('sfx_crit', { volume: 0.5 });
          hitThisFrame.add(e);
          remaining--;
          if (this.projectiles.hitsLeft) this.projectiles.hitsLeft[id] = remaining;
          if (remaining <= 0) { this.projectiles.despawn(id); break; }
        }
      }
    }
  }

  _killEnemy(enemy) {
    let value = this._xpValueForKill();
    if (enemy.isBoss) value += 3;
    if (enemy.isFinal) value += 6;
    while (value > 3) { this.xpOrbs.spawn(enemy.pos.x, enemy.pos.y, 3); value -= 3; }
    this.xpOrbs.spawn(enemy.pos.x, enemy.pos.y, Math.max(1, value));

    const now = this.time.now || 0;
    if (now - this._lastDieSfxAt > 50) {
      const snd = this.sound.add('sfx_die');
      snd.setVolume(0.7);
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
    const elapsed = this.totalTime - Math.max(0, this.remainingTime);
    const minutes = elapsed / 60;
    const d = this.difficulty.danger;
    const p3 = Math.min(0.05 + 0.02 * d + 0.01 * minutes, 0.35);
    const p2 = Math.min(0.20 + 0.03 * d + 0.02 * minutes, 0.7);
    const r = Math.random();
    if (r < p3) return 3;
    if (r < p3 + p2) return 2;
    return 1;
  }

  _spawnHitParticles(x, y, crit = false) {
    if (!this.textures.exists('p')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2).generateTexture('p', 2, 2); g.destroy();
    }
    const color = crit ? 0xfff275 : 0x00e5ff;
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
    this.time.delayedCall(500, () => { if (emitter.manager) emitter.manager.destroy(); });
  }

  _floatText(x, y, text, color = 0xffffff) {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: 10, color: '#ffffff' }).setOrigin(0.5).setDepth(1000);
    t.setTint(color);
    this.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 600, ease: 'cubic.out', onComplete: () => t.destroy() });
  }

  _damageNumber(x, y, value, isCrit = false, isPlayer = false, isHeal = false) {
    if (!this.textures.exists('bignums')) { this._floatText(x, y, String(value), isCrit ? 0xfff275 : 0xffffff); return; }
    const str = String(Math.max(0, value | 0));
    const container = this.add.container(x, y).setDepth(1200);
    const scale = isCrit ? 0.8 : 0.6;
    const digitW = 17 * scale;
    const totalW = str.length * digitW;
    for (let i = 0; i < str.length; i++) {
      const d = str.charCodeAt(i) - 48;
      const row = isHeal ? 3 : (isPlayer ? 2 : (isCrit ? 1 : 0));
      const frame = row * 10 + Phaser.Math.Clamp(d, 0, 9);
      const spr = this.add.image(-totalW / 2 + i * digitW + digitW / 2, 0, 'bignums', frame).setOrigin(0.5);
      spr.setScale(scale);
      spr.setBlendMode(Phaser.BlendModes.ADD);
      container.add(spr);
    }
    const duration = 900;
    this.tweens.add({
      targets: container,
      y: y - 24,
      alpha: { from: 1, to: 0 },
      scale: isCrit ? 0.92 : 0.82,
      duration,
      ease: 'cubic.out',
      onComplete: () => container.destroy(),
    });
  }

  _showEndBanner(text) {
    const { width, height } = this.game.config;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(3000);
    const bg = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0, 0);
    const label = this.add.text(width / 2, height / 2, text, { fontFamily: 'monospace', fontSize: 48, color: '#ffffff' }).setOrigin(0.5);
    c.add([bg, label]);
  }

  _enemyContactDamage(dt) {
    let totalDamage = 0;
    let hitCount = 0;
    const pAabb = this.player.getAabb();

    for (let i = 0; i < this.enemyPool.active.length; i++) {
      const e = this.enemyPool.active[i];
      if (!e.alive || e.isSpawning || !e.canDamage) continue;

      const eAabb = {
        x: e.pos.x + e.collider.ox,
        y: e.pos.y + e.collider.oy,
        w: e.collider.w,
        h: e.collider.h
      };

      if (aabbIntersects(pAabb, eAabb)) {
        totalDamage += (e.damage || 3);
        hitCount++;
      }
    }
    this.playerContactTimer -= dt;
    if (hitCount > 0 && this.playerContactTimer <= 0) {
      const dmg = Math.max(1, Math.round(totalDamage));
      this.player.damage(dmg);
      this._damageNumber(this.player.pos.x, this.player.pos.y - 10, dmg, false, true);
      this.playerContactTimer = this.playerContactInterval;
    }
  }

  update(time, deltaMs) {
    this._handleHotkeys();
    const dt = Math.min(0.1, deltaMs / 1000);
    if (!(this.gamePaused || this.levelUpActive)) {
      this.accumulator += dt;
      this._updateGameTimer(dt);
      this.difficulty.update(dt);
      this._updateDebugText();
    }

    const step = GAME.fixedDt;
    while (this.accumulator >= step) {
      if (this.levelUpActive || this.gamePaused) break;

      const dir = this._readInputDir();
      this.player.maxSpeed = this.player.baseMaxSpeed * this.player.stats.moveSpeed;
      this.player.magnetRadius = PLAYER.magnetRadius * this.player.stats.magnet;
      this.player.step(step, dir, this.obstacleGrid, this.obstacles);
      this.player.updateAim(step, (x, y) => this._findNearestEnemy(x, y));

      this.weaponManager.update(step);
      this.projectiles.update(step, this.obstacleGrid);
      this.aoePool.update(step);
      this.sweepingPool.update(step);

      this.enemyPool.autoSpawn(step, this.player.pos);
      this.enemyPool.update(step, this.player.pos);
      this._buildEnemyGrid();
      this._separateEnemies();
      this._resolvePlayerEnemyCollisions();

      this.xpOrbs.update(step, this.player, (value) => {
        const key = value >= 3 ? 'sfx_xp3' : (value === 2 ? 'sfx_xp2' : 'sfx_xp1');
        this.sound.play(key, { volume: 0.35 });
        this.player.addXP(value);
      });
      this._projectileEnemyCollisions();
      this._enemyContactDamage(step);
      this.accumulator -= step;
    }

    this._cullObstacles();
    this._drawDebug();

    const fps = this.game.loop.actualFps || 0;
    const lines = [
      `FPS: ${fps.toFixed(0)}`,
      `Time: ${this._formatTime(this.remainingTime)}  ${this.gamePaused ? '[PAUSED]' : ''}`,
      `Lv: ${this.player.level}  XP: ${this.player.xp}/${this.player.xpForNext}`,
      `Enemies: ${this.enemyPool.active.length}  Proj: ${this.projectiles.countActive}  Orbs: ${this.xpOrbs.countActive}  Diff: ${this.difficulty.danger.toFixed(2)}`,
    ];
    this.debugText.setText(lines.join('\n'));

    this._updateBgmVolume();
  }

  _formatTime(t) {
    const sec = Math.max(0, Math.floor(t));
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  _updateGameTimer(dt) {
    const prev = this.remainingTime;
    this.remainingTime = Math.max(-600, this.remainingTime - dt);

    const ev = (tag, fn) => {
      if (this.eventsFired.has(tag)) return;
      fn();
      this.eventsFired.add(tag);
    };

    if (prev > 480 && this.remainingTime <= 480) ev('swarm1', () => this._spawnSwarm(60));
    if (prev > 300 && this.remainingTime <= 300) ev('boss1', () => this._spawnBoss());
    if (prev > 180 && this.remainingTime <= 180) ev('swarm2', () => this._spawnSwarm(80));
    if (prev > 90 && this.remainingTime <= 90) ev('portal', () => this._spawnPortal());
    if (prev > 30 && this.remainingTime <= 30) ev('boss2', () => this._spawnBoss());
    if (prev > 0 && this.remainingTime <= 0) ev('final_swarm', () => {
      this._finalSwarmStart = Date.now();
      if (this._announce) this._announce('Final Swarm!');
    });

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
      this._announceContainer = this.add.container(this.game.config.width / 2, 24).setScrollFactor(0).setDepth(2500);
    }
    const t = this.add.text(0, 0, text, { fontFamily: 'monospace', fontSize: 14, color: '#ffd166' }).setOrigin(0.5);
    t.setStroke('#000000', 4);
    this._announceContainer.add(t);
    t.alpha = 0;
    this.tweens.add({
      targets: t, alpha: 1, duration: 150, yoyo: false, onComplete: () => {
        this.time.delayedCall(1100, () => {
          this.tweens.add({ targets: t, alpha: 0, y: t.y - 8, duration: 350, onComplete: () => t.destroy() });
        });
      }
    });
  }

  _startBgm() {
    if (this.bgmIntro?.isPlaying || this.bgmLoop?.isPlaying) return;
    const vol = this._bgmTargetVolume ?? 1.0;
    if (this.bgmIntro) { this.bgmIntro.stop(); this.bgmIntro.destroy(); }
    if (this.bgmLoop) { this.bgmLoop.stop(); this.bgmLoop.destroy(); }
    this.bgmIntro = this.sound.add('bgm', { loop: false, volume: vol });
    this.bgmLoop = this.sound.add('bgm_loop', { loop: true, volume: vol });
    this.bgmIntro.once('complete', () => { if (this.bgmLoop) this.bgmLoop.play(); });
    this.bgmIntro.play();
  }

  _updateBgmVolume(dt) {
    if (!this.bgmIntro && !this.bgmLoop) return;
    const current = this._bgmCurrentVolume ?? 0;
    const target = this._bgmTargetVolume ?? 1.0;
    const speed = 2.5;
    const t = (typeof dt === 'number') ? Math.min(1, speed * dt) : 1;
    const next = current + (target - current) * t;
    this._bgmCurrentVolume = next;
    if (this.bgmIntro) this.bgmIntro.setVolume(next);
    if (this.bgmLoop) this.bgmLoop.setVolume(next);
  }

  _spawnBoss() {
    const e = this.enemyPool.spawnAround(this.player.pos);
    if (!e) return;
    e.hpMax = e.hp = ENEMIES.hp * 25;
    e.speed = ENEMIES.speed * 0.8;
    e.rect.width = ENEMIES.size * 2.0;
    e.rect.height = ENEMIES.size * 2.0;
    e.radius = (ENEMIES.size * 2.0) / 2;
    e.rect.setFillStyle(0x8a2be2);
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
    this._bgmTargetVolume = 0.4;
    this._updateBgmVolume();

    const choices = pickDraft(this, this.player, 3);
    let finalChoices = choices;
    if (!choices || choices.length === 0) {
      finalChoices = [{ type: 'heal', name: 'Full Heal', desc: 'Heal 100%', id: 'heal' }];
    }

    this.levelUpUI = new LevelUpUI(this, {
      choices: finalChoices,
      onChoose: (upg) => {
        this._selectUpgrade(upg);
      },
      onReroll: () => {
        if (this.rerollsLeft <= 0) return;
        this.rerollsLeft--;
        let newChoices = pickDraft(this, this.player, 3);
        if (!newChoices || newChoices.length === 0) {
          newChoices = [{ type: 'heal', name: 'Full Heal', desc: 'Heal 100%', id: 'heal' }];
        }
        this.levelUpUI.updateChoices(newChoices);
      },
      getRerollsLeft: () => this.rerollsLeft,
    });
  }

  _selectUpgrade(opt) {
    if (opt.type === 'new_weapon' || opt.type === 'weapon_upgrade') {
      this.weaponManager.addWeapon(opt.id);
    } else if (opt.type === 'new_talent' || opt.type === 'talent_upgrade') {
      this.upgradeManager.applyTalent(opt.id);
    } else if (opt.id === 'heal') {
      this.player.heal(this.player.hpMax);
    }
    this._closeLevelUpDraft();
  }

  _closeLevelUpDraft() {
    if (this.levelUpUI) { this.levelUpUI.destroy(); this.levelUpUI = null; }
    this.levelUpActive = false;
    this.gamePaused = this._pausedByUser;
    if (!this.gamePaused) this.tweens.resumeAll();
    this._bgmTargetVolume = 1.0;
    this._updateBgmVolume();
  }

  _spawnDifficultyShrines(count) {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * (WORLD.width - 200) + 100;
      const y = Math.random() * (WORLD.height - 200) + 100;
      const s = new Shrine(this, x, y);
      this.shrines.push(s);
    }
  }

  _tryInteract() {
    if (this._portal && this._portal.active) {
      const dx = this.player.pos.x - this._portal.x;
      const dy = this.player.pos.y - this._portal.y;
      if (dx * dx + dy * dy < this._portal.radius * this._portal.radius) {
        this._showEndBanner('Escaped!');
        this.gamePaused = true;
        return;
      }
    }
  }

  _tryInteractShrine() {
    for (const s of this.shrines) {
      if (s.tryInteract(this.player)) return true;
    }
    return false;
  }

  _buildEnemyGrid() {
    this.enemyGrid.clear();
    for (const e of this.enemyPool.active) {
      if (e.alive) {
        const aabb = {
          x: e.pos.x + e.collider.ox,
          y: e.pos.y + e.collider.oy,
          w: e.collider.w,
          h: e.collider.h
        };
        this.enemyGrid.insert(e, aabb);
      }
    }
  }

  _separateEnemies() {
    // Run multiple iterations for better stability
    for (let iter = 0; iter < 3; iter++) {
      for (const e of this.enemyPool.active) {
        if (!e.alive) continue;

        const aabb = {
          x: e.pos.x + e.collider.ox,
          y: e.pos.y + e.collider.oy,
          w: e.collider.w,
          h: e.collider.h
        };

        const others = this.enemyGrid.query(aabb, []);
        for (const o of others) {
          if (o === e || !o.alive) continue;
          const dx = e.pos.x - o.pos.x;
          const dy = e.pos.y - o.pos.y;
          const distSq = dx * dx + dy * dy;
          const minR = e.radius + o.radius; // Keep circle push for smooth separation

          if (distSq > 0 && distSq < minR * minR) {
            const dist = Math.sqrt(distSq);
            const push = (minR - dist) / dist * 0.5;
            e.push(dx * push, dy * push);
            // We don't push 'o' here because 'o' will be processed in its own turn (or already was)
            // pushing both can lead to jitter if not careful, but usually it's fine.
            // Let's push both for faster convergence, but reduce factor.
            o.push(-dx * push, -dy * push);
          }
        }
      }
    }
  }

  _resolvePlayerEnemyCollisions() {
    // Player vs Enemy body
    // Handled in _enemyContactDamage now for continuous damage
  }

  _cullObstacles() {
    // Simple distance check to toggle visibility
    const cx = this.cameras.main.scrollX + this.cameras.main.width / 2;
    const cy = this.cameras.main.scrollY + this.cameras.main.height / 2;
    const cullDist = Math.max(this.cameras.main.width, this.cameras.main.height) * 0.8;
    const cullDistSq = cullDist * cullDist;

    if (this.debugCulling) return;

    for (const o of this.obstacles) {
      const dx = o.x - cx;
      const dy = o.y - cy;
      const vis = (dx * dx + dy * dy < cullDistSq);
      o.display.setVisible(vis);
    }
  }

  _drawDebug() {
    this.debugGfx.clear();
    if (this.debugCollisions) {
      this.debugGfx.lineStyle(1, 0x00ff00, 0.5);
      for (const o of this.obstacles) {
        this.debugGfx.strokeRect(o.aabb.x, o.aabb.y, o.aabb.w, o.aabb.h);
      }
      this.debugGfx.lineStyle(1, 0xff0000, 0.5);
      for (const e of this.enemyPool.active) {
        if (e.alive) this.debugGfx.strokeRect(e.rect.x - e.rect.width / 2, e.rect.y - e.rect.height / 2, e.rect.width, e.rect.height);
      }
      this.debugGfx.lineStyle(1, 0x0000ff, 0.5);
      this.debugGfx.strokeRect(this.player.rect.x - this.player.rect.width / 2, this.player.rect.y - this.player.rect.height / 2, this.player.rect.width, this.player.rect.height);
    }
  }

  _updateDebugText() {
    // Updated in update()
  }
}
