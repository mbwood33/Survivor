# Changelog

All notable changes to this project are documented here. This file starts with the first tracked version (v0.0.1). Earlier work is summarized in the Pre-VC section.

## v0.0.3 - Audio, Visual, and Collision Refinements (2025-11-13)

Audio
- Hoard spawn SFX plays at the start of swarms (not the final swarm).
- Player shoot SFX plays once per volley (does not stack with projectile count).
- Enemy death SFX includes horizontal panning based on death X relative to camera center (hard pan off-screen; proportional on-screen) and is gated to avoid stacked triggers in the same frame.

Visuals
- Projectiles render as short, angled lines; thickness scales with projectile size upgrades.
- XP orbs reworked as additive glow sprites with a gentle pulsing scale (light-orb feel).
- Damage/heal numbers: longer opaque phase; crits have a stronger pulse and strobe; heals have a larger, higher-frequency wave.

Collisions
- Player/enemy bodies now resolve via AABB MTV split so neither can occupy the other’s collider.
- Enemies stop moving when in contact; player is minimally corrected (respecting terrain) and cannot walk through enemies; contact damage ticks reliably.


## v0.0.2 - Player/Enemy Collision and Spawn Polish (2025-11-10)

Collisions and Spawning
- Player-enemy overlap now moves the enemy away (not the player), respecting terrain, so enemies cannot push the player into walls.
- Enemy-enemy separation pass (spatial-grid broadphase) to prevent stacking and keep swarms readable.
- Spawn animation: enemies fade/"rise" in over ~0.5s, remain stationary/harmless until fully spawned.
- On-screen spawning near the player with a minimum distance; never spawns directly on top of the player.
- Contact damage uses a global tick interval; spawning enemies are excluded from damage checks.

Combat/UI polish
- Crits use a single shared roll for damage and visuals (no mismatches).
- Damage/heal number animations enhanced:
  - Normal/player damage shrink as they fade.
  - Crits are larger, quick pulse + color strobe, then shrink/fade.
  - Heals (new blue/cyan row) float with a per-digit wave effect.
- All popups/FX tweens pause/resume correctly on Pause and during Level-Up.

Upgrades & Balance
- Four rarity tiers introduced (common, rare, super, ultra) with adjusted weights.
- Healing cards integrated (rare+); appear earlier but remain uncommon.
- Stat caps increased broadly (esp. damage/attack speed).
- Projectile size tuning: reduced starting radius and reduced per-card growth to slow "oversizing".

## v0.0.1 - Initial Tracked Release (2025-11-07)

Gameplay and Systems
- Damage popups use a 3-row number spritesheet (white=normal, yellow=crit, red=player damage) with float/fade tween and additive glow.
- Hit feedback adds neon particle bursts on impact.
- Projectiles have limited max distance (speed x lifetime) and despawn when exceeded; duration upgrades extend travel distance.
- Pierce rework: each projectile carries a hit budget (1 + pierce) and damages multiple enemies before despawning; same-frame de-dupe.
- Rerolls increased to 5 for level-up drafts.
- Player contact damage uses a cooldown tick (global interval) instead of per-frame damage; red damage numbers appear when hit.
- Enemies spawn on-screen near the player but never directly on top (min distance enforced).
- Bosses: tougher base stats, neon HP bar above bosses, and much larger XP drops (split into tiered orbs). Final boss spawns on the far side of the portal relative to player position.
- Announcements for key events (swarm waves, bosses, portal reveal, final swarm).

Balance & Stats
- Damage model split:
  - Base damage add (+X) increases the base before multipliers.
  - Damage multiplier scales final damage.
- New upgrade cards: Base Damage (+1 uncommon, +2 rare). Existing damage cards renamed to "Damage (Mult)".
- Starting damage set to 4; enemy base HP set to 20 (targets ~4-6 hits early with default cadence).
- Per-hit damage clamped to 999 (post-crit).

Controls & Feel
- Movement is immediate and frictionless: velocity sets directly from input and stops instantly on release.
- Pausing (ESC/Start) and level-up modal now pause/resume all tweens so damage popups/FX freeze appropriately.

UI & Rendering
- Virtual resolution set to 640x360 with integer scaling and precise centering; pixel-art friendly (no antialiasing, roundPixels).
- HUD: bottom-center XP bar and level label sized for 640x360.
- Level-Up UI scaled down for 640x360 (smaller panel/cards/fonts). Lane-unique selection behavior preserved.
- Enemy rectangles get black outlines for readability; boss HP bar added above bosses.

Content & Economy
- XP orb pool increased to 2000. When the pool is exhausted, the oldest active orb is recycled so kills always drop XP.
- Difficulty shrines and time-based scaling influence enemy stats and increase the chance for higher-tier XP orb drops.

Bug Fixes
- Fixed Phaser 3.90 particle API usage (no more createEmitter on returned emitter); no runtime crash.
- Fixed input smoothing drift and collision jitter; input is now raw and movement stops immediately.
- Fixed game continuing under level-up modal by pausing tweens and stepping logic.

Config & Palette
- Adopted a brighter neon palette (player/projectiles/obstacles/enemies) for a retro-futuristic look.

## Pre-VC (prior to v0.0.1)

Foundation & Framework
- Project scaffolded with Phaser 3 + Vite. Scenes: GameScene (core) and UIScene (HUD).
- Virtual camera world (8k x 8k), background grid, display layers.
- Virtual resolution experiments: 1280x720 -> 960x540 -> 1024x576 -> pixel-perfect scaling; later standardized to 640x360.
- Input: keyboard, basic gamepad with deadzone.

Player
- Blue square player with kinematics, then upgraded to frictionless movement.
- AABB collider and axis-separated collision with obstacles.
- Auto-fire toward nearest enemy; multi-shot logic (fan toward target, radial when no targets); per-projectile targeting.

World & Obstacles
- Procedural obstacles (trees as triangles, rocks as rectangles) with AABB colliders.
- SpatialGrid broadphase and camera-scope culling.

Enemies
- Pooled enemies with basic chase AI; contact damage system.
- Time/difficulty-scaled auto-spawning; burst spawn and debug hooks.

Combat & Economy
- Projectile pool (circle colliders), lifetime, world culling.
- Enemy HP/damage, deaths spawn XP orbs; magnet and pickup radius with pooling.
- Level-up system: stats framework (damage, attack speed, projectile speed/amount/size (formerly area), duration, pierce, crit chance, magnet, move speed), caps, rarity weights, and 3-card drafts with lane uniqueness and rerolls.

UI & Debug
- HUD with level and XP bar; debug text (FPS, XP, counts, tuning values).
- Debug overlays: culling rect, projectile/XP outlines, collision AABBs.
