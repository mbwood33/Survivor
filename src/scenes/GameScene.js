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

    // Background mall floor (static): patterned 32x32 tiles across the world
    this._createMallFloorBackground();

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

  _createMallFloorTiles() {
    if (this._mallFloorTileKeys && this._mallFloorTileKeys.length > 0) return;
    const sheet = this.textures.get('mall-floor');
    if (!sheet) return;
    const source = sheet.getSourceImage();
    const cols = Math.floor(source.width / 32);
    const keys = [];
    for (let i = 0; i < cols; i++) {
      const key = `mall-floor-32-${i}`;
      if (!this.textures.exists(key)) {
        const tex = this.textures.createCanvas(key, 32, 32);
        const ctx = tex.getContext();
        ctx.clearRect(0, 0, 32, 32);
        const sx = i * 32;
        const sy = 0;
        ctx.drawImage(source, sx, sy, 32, 32, 0, 0, 32, 32);
        tex.refresh();
      }
      keys.push(key);
    }
    this._mallFloorTileKeys = keys;
  }

  _createMallFloorBackground() {
    this._createMallFloorTiles();
    const tileKeys = this._mallFloorTileKeys || [];
    if (!tileKeys.length) return;

    // Map tile indices: 0 = gray, 1 = tan, 2 = olive, 3 = brown
    const TILE = { G: 0, T: 1, O: 2, B: 3 };
    const baseTile = TILE.G;

    // Example patterns
    const patterns = [];
    const p1 = [
      'GGBOTTOBGG', 'GGBOTTOBGG', 'BBBOTTOBBB', 'OOOOTTOOOO', 'TTTTTTTTTT',
      'TTTTTTTTTT', 'OOOOTTOOOO', 'BBBOTTOBBB', 'GGBOTTOBGG', 'GGBOTTOBGG',
    ];
    patterns.push(p1.map(row => row.split('').map(ch => TILE[ch])));

    const tilesX = Math.ceil(WORLD.width / 32);
    const tilesY = Math.ceil(WORLD.height / 32);
    const patternMap = new Array(tilesY);
    for (let y = 0; y < tilesY; y++) {
      patternMap[y] = new Array(tilesX).fill(baseTile);
    }

    const rng = new RNG((Date.now() ^ 0x1234abcd) | 0);
    const patches = Math.floor((tilesX * tilesY) / 800);
    for (let n = 0; n < patches; n++) {
      const pattern = patterns[n % patterns.length];
      const ph = pattern.length;
      const pw = pattern[0].length;
      const maxX = Math.max(1, tilesX - pw);
      const maxY = Math.max(1, tilesY - ph);
      const startX = rng.int(0, maxX);
      const startY = rng.int(0, maxY);
      for (let py = 0; py < ph; py++) {
        const row = pattern[py];
        const ty = startY + py;
        if (ty < 0 || ty >= tilesY) continue;
        for (let px = 0; px < pw; px++) {
          const tx = startX + px;
          if (tx < 0 || tx >= tilesX) continue;
          patternMap[ty][tx] = row[px];
        }
      }
    }

    // Build chunks
    const chunkKeys = [];
    const variants = 8;
    for (let v = 0; v < variants; v++) {
      const rt = this.make.renderTexture({ width: 512, height: 512, add: false });
      const startX = rng.int(0, Math.max(0, tilesX - 16));
      const startY = rng.int(0, Math.max(0, tilesY - 16));
      for (let ty = 0; ty < 16; ty++) {
        const gy = startY + ty;
        if (gy >= tilesY) continue;
        for (let tx = 0; tx < 16; tx++) {
          const gx = startX + tx;
          if (gx >= tilesX) continue;
          const idx = patternMap[gy][gx] || baseTile;
          const key = tileKeys[idx % tileKeys.length];
          const tileImg = this.make.image({ x: tx * 32 + 16, y: ty * 32 + 16, key, add: false });
          tileImg.setScale(1.03125);
          rt.draw(tileImg);
          tileImg.destroy();
        }
      }
      const key = `mall-floor-512-${v}`;
      rt.saveTexture(key);
      rt.destroy();
      chunkKeys.push(key);
    }

    const chunksX = Math.ceil(WORLD.width / 512);
    const chunksY = Math.ceil(WORLD.height / 512);
    for (let y = 0; y < chunksY; y++) {
      for (let x = 0; x < chunksX; x++) {
        const idx = (Math.random() * chunkKeys.length) | 0;
        const key = chunkKeys[idx];
        const img = this.add.image(x * 512 + 256, y * 512 + 256, key);
        img.setScale(1.002);
        img.setDepth(0);
        this.bgLayer.add(img);
      }
    }
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

  preload() {
    if (!this.textures.exists('bignums')) {
      this.load.spritesheet('bignums', 'assets/sprites/fonts/big-big-nums-1.png', { frameWidth: 17, frameHeight: 31 });
    }
    if (!this.textures.exists('mall-floor')) {
      this.load.spritesheet('mall-floor', '/assets/sprites/mall-sprites-32x32.png', { frameWidth: 32, frameHeight: 32 });
    }
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
    for (let i = 0; i < this.enemyPool.active.length; i++) {
      const e = this.enemyPool.active[i];
      if (!e.alive || e.isSpawning || !e.canDamage) continue;
      const dx = e.pos.x - this.player.pos.x, dy = e.pos.y - this.player.pos.y;
      const rr = e.radius + 12;
      if (dx * dx + dy * dy <= rr * rr) {
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
    this._bgmTargetVolume = (this.gamePaused || this.levelUpActive) ? 0.4 : 1.0;
    this._updateBgmVolume();
    if (this.pendingLevelUps > 0) { this.pendingLevelUps--; this._openLevelUpDraft(); }
  }

  _cullObstacles() {
    const cam = this.cameras.main;
    const pad = 128;
    const view = { x: cam.worldView.x - pad, y: cam.worldView.y - pad, w: cam.worldView.width + pad * 2, h: cam.worldView.height + pad * 2 };
    const candidates = this.obstacleGrid.query(view, []);
    for (let i = 0; i < candidates.length; i++) {
      const o = candidates[i];
      const inside = !(o.aabb.x + o.aabb.w < view.x || o.aabb.x > view.x + view.w || o.aabb.y + o.aabb.h < view.y || o.aabb.y > view.y + view.h);
      o.display.setVisible(inside || !this.debugCulling);
    }
    if (!this._hasCulledOnce) {
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
    if (this.debugCulling) {
      g.lineStyle(1, 0xffffff, 0.6);
      g.strokeRect(cam.worldView.x, cam.worldView.y, cam.worldView.width, cam.worldView.height);
    }
    g.lineStyle(0);
    const hpPct = this.player.hp / this.player.hpMax;
    g.fillStyle(0x2ecc71, 0.8);
    g.fillRect(this.player.pos.x - 12, this.player.pos.y - 22, 24 * clamp(hpPct, 0, 1), 3);

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
    const pr = 12;
    for (let i = 0; i < this.enemyPool.active.length; i++) {
      const e = this.enemyPool.active[i];
      if (!e.alive || e.isSpawning) continue;
      const pa = this.player.getAabb();
      const er = e.radius;
      const ea = { x: e.pos.x - er, y: e.pos.y - er, w: er * 2, h: er * 2 };
      if (aabbIntersects(pa, ea)) {
        e.vel.x = 0; e.vel.y = 0;
        const mtvX = aabbOverlapX(pa, ea);
        const mtvY = aabbOverlapY(pa, ea);
        if (Math.abs(mtvX) < Math.abs(mtvY)) {
          const half = mtvX * 0.5;
          this.player.resolveCollisions(this.obstacleGrid, this.obstacles, half, 0);
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

  _spawnDifficultyShrines(count) {
    const rng = new RNG(12345);
    this.shrines = [];
    for (let i = 0; i < count; i++) {
      const x = rng.int(100, WORLD.width - 100);
      const y = rng.int(100, WORLD.height - 100);
      this.shrines.push(new Shrine(this, x, y, i));
    }
  }

  _tryInteractShrine() {
    const p = this.player;
    let interacted = false;
    for (const s of this.shrines) {
      const dx = p.pos.x - s.pos.x;
      const dy = p.pos.y - s.pos.y;
      if (dx * dx + dy * dy < 60 * 60) {
        if (s.interact()) {
          interacted = true;
          break;
        }
      }
    }
    return interacted;
  }

  _tryInteract() {
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
  }

  _spawnFinalBoss() {
    const e = this.enemyPool.spawnAround(this.player.pos);
    if (!e) return;
    e.hpMax = e.hp = ENEMIES.hp * 80;
    e.speed = ENEMIES.speed * 0.9;
    e.rect.width = ENEMIES.size * 2.5;
    e.rect.height = ENEMIES.size * 2.5;
    e.radius = (ENEMIES.size * 2.5) / 2;
    e.rect.setFillStyle(0xff6b6b);
    e.isBoss = true;
    e.isFinal = true;
    this._finalBossAlive = true;
  }

  _updateDebugText() {
    if (!this.debugText) return;
    const d = this.difficulty;
    this.debugText.setText(
      `Time: ${(d.timeSeconds / 60).toFixed(1)}m\n` +
      `Danger: ${d.danger.toFixed(2)}\n` +
      `Shrines: ${d.shrineCount}\n` +
      `Enemies: ${this.enemyPool.active.length}`
    );
  }
}
