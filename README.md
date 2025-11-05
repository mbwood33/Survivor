Survivor Clone — Phaser + Vite Prototype

Quick Start
- Install Node.js LTS (includes npm)
  - Windows/macOS: https://nodejs.org (use the LTS installer)
  - Linux: use your package manager or NodeSource instructions
  - Verify in a new terminal: `node -v` and `npm -v`
  - Required: Node.js 18 or newer (Vite 7 requires >= 18)
- Install dependencies (inside the project folder):
  - `npm install`
- Start the dev server (with hot reload):
  - `npm run dev`
  - Open the printed local URL (default http://localhost:5173)

That’s it — Vite serves the app in development with instant reloads.

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

Prerequisites and Install Details
- Node.js & npm
  - Download from nodejs.org (LTS). The installer includes npm.
  - Check versions: `node -v` should print v18+; `npm -v` should print 9+.
- No global Vite install needed
  - The project uses Vite via npm scripts and devDependencies.
  - If you prefer, `npx vite` also works, but `npm run dev` is recommended.
- Windows PowerShell users
  - Use a regular PowerShell or Terminal window. If execution policy blocks scripts, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (optional).

Run, Build, Preview
- Development: `npm run dev`
  - Hot reload for JS/HTML/CSS.
- Production build: `npm run build`
  - Outputs to `dist/` (static assets you can host anywhere).
- Preview the production build: `npm run preview`
  - Serves `dist/` locally on a random port.

Graphics & Scaling
- Virtual resolution: 1024×576 (even 32×32 tile grid)
- Integer scaling: canvas scales to 1x/2x/3x… to fill the window without blur
- Pixel-perfect settings: `pixelArt: true`, `antialias: false`, `roundPixels: true`

Features Overview
- Large world with obstacle culling and SpatialGrid broadphase
- Player movement (accel, friction, clamped) + AABB collisions
- Enemies with chase + terrain collisions; scaling via time and difficulty shrines
- Auto‑firing weapon + stats system (damage/attack speed/projectile speed/size/duration/pierce/crit)
- Multi‑shot per‑projectile enemy targeting; radial fallback when no targets
- Projectile pool with terrain collision, crits, and pierce
- XP Orbs with three tiers (color-coded), magnet/pickup radius
- Level‑Up draft (3 choices + rerolls), unique lanes per draft, upgrade caps, fallbacks when capped
- 10‑minute run timer with swarms, bosses, portal + final boss
- HUD: Level and XP bar; debug overlay shows FPS, time, counts, difficulty

Project Structure
- index.html — entry
- src/main.js — Phaser + Vite bootstrap, integer scaling
- src/config.js — tunables (resolution, world, player/enemy pools)
- src/scenes/ — GameScene (core loop/timer/events), UIScene (HUD bridge)
- src/entities/ — Player, Enemy
- src/pools/ — EnemyPool, ProjectilePool, XPOrbPool
- src/systems/ — SpatialGrid (broadphase), Stats (resolve shots), Upgrades (draft data)
- src/ui/ — HUD, LevelUpUI (modal)
- src/utils/ — MathUtil, RNG

Troubleshooting
- Blank/black screen
  - Open DevTools Console (F12) and look for errors.
  - Ensure Node.js >= 18. Reinstall Node if needed.
  - Delete `node_modules` and reinstall: `rm -rf node_modules package-lock.json` (or on Windows: delete the folders) then `npm install`.
  - Port conflict? Run `npm run dev -- --port 5174` and open the new URL.
- Gamepad not detected
  - Confirm the controller is connected before launching the game, then press any button.
- Scaling looks blurry
  - The project enforces integer scaling; if your browser zoom is not 100%, reset zoom.
  - Try resizing the window to a multiple of 1024×576 (e.g., 2048×1152).
- Slow performance
  - Close other tabs/apps, lower active enemies via code (config), or reduce obstacle count.

Notes
- Terrain pass‑through is supported per enemy (`ignoreTerrain`) and per projectile (`collidesTerrain:false`).
- To tweak upgrades, rarity, and caps, edit `src/systems/Upgrades.js`.
- To adjust the timer/boss events, edit the schedule in `GameScene`.

