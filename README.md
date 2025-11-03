Survivor Clone — Phaser Prototype

Run
- npm install
- npm run dev
- Open the printed local URL (e.g., http://localhost:5173)

Controls
- Move: WASD / Arrow Keys
- Gamepad: Left stick (deadzone 0.2), Start = Pause
- Pause: ESC
- Interact: E (difficulty shrines, portal)
- Debug:
  - F1: Culling rect
  - F2: Collision AABBs
  - F5: Projectile outlines
  - F6: XP radii
  - B: Burst-spawn enemies
  - P: Test volley (ignores cooldown)
- Tuning shortcuts (fallback keys):
  - Speed base: [ or 1 (down), ] or 2 (up)
  - Accel: ; or 3 (down), ' or 4 (up)
  - Friction: , or 5 (down), . or 6 (up)
  - Input smoothing K: - or 7 (down), / or 8 (up)

Features
- 8000×8000 world with obstacle culling and SpatialGrid broadphase
- Player movement (accel, friction, clamped) + AABB collisions
- Enemies with basic chase + terrain collisions; difficulty scaling over time/shrines
- Auto‑firing weapon with stats system (damage/ASPD/area/etc), multi‑shot per‑target aim
- Projectile pool, terrain hits, crits, XP orb tiers (color coded)
- Level‑Up draft (3 choices + rerolls), uniqueness per draft lane, caps, fallbacks
- Pause and 10‑minute run timer with swarms, bosses, portal + final boss
- HUD: Level and XP bar; debug overlay shows FPS, time, counts, diff

Project Structure
- index.html — entry
- src/config.js — tunables
- src/main.js — Phaser setup
- src/scenes/ — GameScene (core loop), UIScene (HUD)
- src/entities/ — Player, Enemy
- src/pools/ — EnemyPool, ProjectilePool, XPOrbPool
- src/systems/ — SpatialGrid, Stats, Upgrades
- src/ui/ — HUD, LevelUpUI
- src/utils/ — MathUtil, RNG

Notes
- Terrain pass‑through is supported per enemy (`ignoreTerrain`) and per projectile (`collidesTerrain:false`).
- To tweak rarity/caps, edit `src/systems/Upgrades.js`.

