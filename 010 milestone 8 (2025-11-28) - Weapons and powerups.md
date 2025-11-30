# Weapon & Upgrade Design Spec

## 1. Overview

This document defines the **initial weapon set** and the **upgrade system** for the Antigravity survivor-like prototype.  

Goals:

- Each weapon **feels distinct** mechanically.
- All weapons share a **common data-driven structure** (stats, upgrades).
- Implementation should be compatible with **Phaser** using:
  - Sprites for entities where helpful (possibly later implementation).
  - `Phaser.GameObjects.Graphics` for simple effects (rings, beams, etc.).

Weapon types:

1. **Projectile**
   - Star Bolt
   - Prism Shot
2. **AoE**
   - Sunflare Pulse
   - Frost Nova
3. **Sweeping**
   - Arc Blade
   - Meteor Knuckle
4. **Returning**
   - Moon Disc
   - Magnet Orb

---

## 2. Weapon System Architecture (Implementation Notes)

### 2.1. Core Concepts

- Each weapon is an instance of a **WeaponDefinition** with:
  - `id` (e.g., `"star_bolt"`)
  - `name` (display name)
  - `type` (`"projectile" | "aoe" | "sweeping" | "returning"`)
  - `level` (1+)
  - `baseStats` (defaults)
  - `currentStats` (after upgrades)
  - `update(delta)` or `fire()` behavior callbacks

- Weapons are updated each frame by a **WeaponManager** tied to the player:
  - Keeps track of cooldowns.
  - Spawns projectiles / AoEs / sweeps.
  - Applies weapon-specific logic.

### 2.2. Shared Stats (All Weapons)

All weapons should support the following core stats (per-weapon), which can be modified by upgrades:

- `damage`: integer base damage per hit / tick.
- `critChance`: percentage (0–100).
- `critMultiplier`: e.g., 1.5×, 2×.
- `cooldown`: seconds between activations.
- `size`: scaling factor for projectile/sprite radius, AoE radius, etc.
- `quantity`: semantic meaning depends on weapon type:
  - Projectile: number of shots per firing cycle.
  - AoE: number of pulses or ticks per cycle.
  - Sweeping: number of slashes per activation.
  - Returning: number of discs/orbs at once.

### 2.3. Category-Specific Stats

**Projectile & Returning Projectile:**

- `pierceCount`: number of enemies hit before despawning.
- `bounceCount`: number of ricochets off enemies/walls.
- `distance`: max travel distance before despawn/return.

**AoE:**

- `tickDamage`: damage per tick (if lingering).
- `duration`: how long the AoE remains active (lingering effects).
- `statusPotency`: strength/duration of applied status effects (e.g., slow %, freeze duration).

**Sweeping:**

- `arcSize`: angle in degrees for a sweep (e.g., 90°, 180°).
- `knockback`: force applied to enemies on hit.
- `attackSpeed`: time to complete one sweep animation (lower = faster).

---

## 3. Weapons – Detailed Behavior & Visual Design

### 3.1. Projectile Weapons

---

#### 3.1.1. Star Bolt

**Type:** Projectile  
**Theme:** Orbiting darts that burst outward unpredictably.

**Behavior:**

1. When off cooldown, weapon spawns **N small darts** (`quantity`) orbiting the player for a short duration.
2. After a brief orbit time (e.g., 0.5–1.0s), each dart:
   - Chooses a **random direction** within 360°.
   - Launches outward as a fast projectile.
3. Projectiles:
   - Deal `damage` on hit.
   - Can **crit** using `critChance` and `critMultiplier`.
   - Can **pierce** up to `pierceCount` enemies.
   - May **bounce** off enemies if `bounceCount > 0`.
   - Despawn after traveling `distance` or exhausting pierces/bounces.

**Visuals (Phaser Graphics):**

- Use `Graphics` to draw **tiny glowing polygons** (e.g., triangles or diamonds).
- Orbiting phase:
  - Draw small polygons around the player, rotating over time.
- Launch phase:
  - Simple polygon with a short motion trail (optional: line from previous position).

**Upgrade Synergy / Notes:**

- Increasing `quantity` significantly changes feel: more darts orbit → “burst” projectile wave.
- Higher `pierceCount` and `distance` turn this into a pseudo-screen-clear at high levels.
- `size` slightly increases dart size + hitbox.

---

#### 3.1.2. Prism Shot

**Type:** Projectile  
**Theme:** Split beam that refracts into multiple smaller shots.

**Behavior:**

1. On fire:
   - Emits a **primary beam** from player toward a target direction:
     - Auto-aim to nearest enemy...
2. Primary beam:
   - Travels straight up to its `distance`.
   - At a **split point** (e.g., at 50–70% of `distance` or upon first hit):
     - Beam **refracts** into `N` sub-projectiles (`quantity`).
3. Sub-projectiles:
   - Fan out with a **spread angle** (e.g., ±15–45° around the primary direction).
   - Each deals `damage` and respects `pierceCount`, `bounceCount`, and `distance` (scaled).

**Visuals (Gradient Beam):**

- Primary beam:
  - Line/rectangle drawn via `Graphics` with a **rainbow-colored gradient-like effect**:
    - Simulate gradient by drawing multiple narrow rectangles with varying alpha.
- Sub-projectiles:
  - Small glowing orbs or triangles, maybe tinted lighter than the main beam.

**Upgrade Synergy / Notes:**

- `size` affects:
  - Beam thickness.
  - Hitbox height/width.
- `quantity` scales number of **sub-projectiles**, not number of beams fired.
- Increasing `distance` moves split point farther and extends sub-projectile travel.
- Potential evolutions:
  - Beam splits multiple times.
  - Sub-projectiles gain mini-AoE on hit.

---

### 3.2. AoE Weapons

---

#### 3.2.1. Sunflare Pulse

**Type:** AoE  
**Theme:** Periodic sun-like ring expanding out of the player.

**Behavior:**

1. Every `cooldown` seconds:
   - Create an expanding ring centered on the player’s position.
2. Ring:
   - Starts at small radius and grows to a max radius based on `size`.
   - Damages each enemy **once per pulse** when the ring passes over them:
     - Damage = `damage` or `tickDamage`.
3. Optional: ring can:
   - Push enemies outward slightly (small knockback).
   - Apply light blind/stun (in future iterations).

**Visuals (Phaser Graphics):**

- Use `Graphics.strokeCircle` to draw a **ring** expanding from radius 0 → `maxRadius`.
- Color: warm yellows/oranges; alpha fades as it expands.
- Only needs one graphics object per pulse.

**Upgrade Synergy / Notes:**

- `size` scales max radius.
- `quantity` could be interpreted as:
  - Number of **consecutive pulses** per activation.
  - e.g., Level 1: 1 wave → Level 3: 3 waves, each offset by 0.2–0.3s.
- `duration` is effectively the time it takes ring to expand; can be used to control speed.
- `statusPotency` could later boost:
  - Stun duration / blind effect magnitude.

---

#### 3.2.2. Frost Nova

**Type:** AoE  
**Theme:** Burst of cold that slows and damages enemies.

**Behavior:**

1. On fire:
   - Instantly triggers a **circular shockwave** around the player.
2. Any enemy within radius:
   - Takes `damage` (single burst).
   - Receives a **slow effect**:
     - Slow strength and duration derived from `statusPotency` and `damage`.
3. Higher levels may:
   - Apply heavy slow (e.g., 60–80%) or brief freeze.
   - Add a small **lingering frost zone** (using `duration` and `tickDamage`).

**Visuals (Phaser Graphics or Sprite):**

- Graphics:
  - Filled circle with soft edges (draw a circle with lower alpha).
  - White/blue color.
- Optionally overlay shard-like radial lines for a more “icy” feel.

**Upgrade Synergy / Notes:**

- `size` controls nova radius.
- `duration` used when there is a **lingering frost patch** after initial burst.
- `tickDamage` only relevant if using lingering Auric frost area.
- `statusPotency` directly ties into:
  - Slow% and slow duration.
  - Chance to fully freeze at high upgrade levels.

---

### 3.3. Sweeping Weapons

---

#### 3.3.1. Arc Blade

**Type:** Sweeping  
**Theme:** Crescent slash in front of the player.

**Behavior:**

1. When activated:
   - Creates a **sweep arc** in front of the player.
   - Arc is defined by:
     - `arcSize` in degrees (e.g., 120° in front).
     - `attackSpeed` = time to animate slash across that arc.
2. Enemies inside the arc during the active window:
   - Take `damage`.
   - Experience `knockback` away from the player.
3. Higher `quantity`:
   - Can trigger **multiple slashes** per activation:
     - e.g., left-to-right then right-to-left with a small time offset.

**Visuals:**

- Graphics-based:
  - Draw an arc segment using `Graphics.arc()` or approximated with polygons.
  - Color: sharp bright edge and slightly translucent trail.

**Upgrade Synergy / Notes:**

- `arcSize` upgrades → more coverage.
- `attackSpeed` upgrades → faster swing → harder to dodge for enemies, more responsive feel.
- `quantity` → additional slashes per activation.
- `size` → increases slash thickness / radial distance.

---

#### 3.3.2. Meteor Knuckle

**Type:** Sweeping / Short-range AoE  
**Theme:** Explosive punch triggered by player movement.

**Behavior:**

1. Weapon is **movement-based**:
   - Tracks the **distance traveled** by the player.
   - When cumulative distance exceeds a threshold (e.g., 4–6 tiles), weapon triggers.
2. On trigger:
   - A **fiery punch explosion** appears at the player’s current position or slightly offset in facing direction.
3. Explosion:
   - Deals `damage` in a small radius around impact.
   - Applies significant `knockback`.
   - Has short-lived lingering burn effect at higher levels (using AoE-like `duration` + `tickDamage` if desired).

**Visuals:**

- Graphics:
  - Small circular explosion with orange/red/yellow concentric layers.
  - Optionally some short radial lines.
- Could also use a slap/punch sprite that briefly appears and fades.

**Upgrade Synergy / Notes:**

- `size` increases explosion radius.
- `attackSpeed` can:
  - Reduce minimum distance needed to trigger explosion, effectively making it more frequent.
- `quantity`:
  - Can create **multiple hits**:
    - e.g., one main punch at player location, and a smaller echo punch behind or ahead.
- Nice synergy with movement speed builds.

---

### 3.4. Returning Weapons

---

#### 3.4.1. Moon Disc

**Type:** Returning Projectile  
**Theme:** Disc that returns at a different angle than it left, adding unpredictability.

**Behavior:**

1. On fire:
   - Spawns a **disc** at the player’s position.
   - Launches in a chosen direction (target enemy or aim direction).
2. Outbound phase:
   - Travels straight up to `distance`.
   - Damages enemies via `damage`, with `pierceCount` and `bounceCount` respected.
3. Return phase:
   - Instead of directly retracing its original path, it:
     - Calculates a **return angle**:
       - Base = angle back toward player.
       - Offset = small random or fixed angle (e.g., ±30°).
     - Flies along this new path toward/near the player.
4. If it passes near the player or travels a max total distance:
   - Despawns.

**Visuals:**

- Disc sprite:
  - Circular sprite with a crescent glow.
- Graphics:
  - Circle with a glow and a faint trailing arc.

**Upgrade Synergy / Notes:**

- `quantity` → multiple discs at once, each with their own slight return angles.
- `distance` → farther travel for each phase.
- `size` → disc radius and hitbox size.
- Higher `bounceCount` gives a very chaotic path when combined with the offset return angle.

---

#### 3.4.2. Magnet Orb

**Type:** Returning Projectile  
**Theme:** Orb that tugs enemies toward it during travel; return after max distance.

**Behavior:**

1. On fire:
   - Launches a **spherical orb** away from the player in a chosen direction.
2. Outbound phase:
   - Moves up to `distance`.
   - Every frame, it:
     - Applies a **pull force** to enemies in a certain radius.
     - Pull strength is modulated by enemy “size/weight”:
       - Smaller enemies pulled more strongly.
       - Larger enemies pulled less (but still nudged).
   - Also deals `damage` on direct collision.
3. Return phase:
   - After reaching max distance:
     - Orb returns like a standard returning projectile, straight toward the player.
     - Continues to pull enemies as it returns.
4. Despawns when close enough to the player or after a full outbound+inbound cycle.

**Visuals:**

- Graphics-based sphere:
  - Semi-transparent circle, bluish or purplish, with a subtle ripple effect.
- Optional:
  - Draw faint curves or “lines of force” around the orb using `Graphics` to visualize the pull area.

**Upgrade Synergy / Notes:**

- `size` affects:
  - Orb radius.
  - Pull radius.
- `quantity`:
  - Multiple orbs could be launched sequentially or in a small spread.
- `statusPotency` (if reused from AoE concept) could:
  - Strengthen pull.
  - Add a short slow effect on enemies pulled.

---

## 4. Upgrade System

### 4.1. Global Upgrade Types (Shared)

These upgrades can apply to an individual weapon instance when chosen on level-up:

- **Damage** (integer)
  - Increases base `damage` for that weapon.
- **Crit Chance**
  - Increases `critChance` by a fixed %, subject to cap (e.g., 50–75% max).
- **Crit Damage Multiplier**
  - Increases `critMultiplier` (1.5 → 1.75 → 2.0, etc.).
  - Higher rarities give bigger jumps.
- **Cooldown**
  - Reduces `cooldown` scalar (e.g., -5% per pickup).
  - Never below some floor (e.g., 0.2s).
- **Size**
  - Multiplies hitbox and visual scale (projectile size, AoE radius, explosion radius).
- **Quantity**
  - Boosts number of projectiles, pulses, sweeps, discs, etc.

Mechanically, each upgrade is likely a data entry:

```json
{
  "id": "upgrade_damage_small",
  "type": "damage",
  "value": 5,
  "rarity": "common",
  "appliesTo": "any"
}
```

### 4.2. Projectile & Returning Upgrades

- **Pierce Count**
  - +1 pierce per level-up, up to a max (to avoid infinite).
- **Bounce Count**
  - Increases number of enemy/wall ricochets.
  - At higher values, things can get very chaotic—good for feeling powerful late-game.
- **Distance**
  - Increases travel distance before despawn or return.
  - For returning weapons, affects both outbound and inbound path length.

### 4.3. AoE Upgrades
- **Damage per Tick/Burst**
  - Increases damage for each pulse or tick.
- **Duration**
  - Extends how long a lingering AoE sticks around (clouds, frost fields).
- **Status Potency**
  - Strengthens status effects applied:
    - For Frost Nova:
      - Higher slow percentage.
      - Longer slow duration.
      - Chance to freeze at high levels.
    - For future AoEs:
      - Stronger poison, burn, or stun, etc.

### 4.4. Sweeping Upgrades
- **Arc Size**
  - Increases angle coverage (e.g., +20° per upgrade).
- **Knockback Strength**
  - Increases pushback distance / force.
- **Attack Speed**
  - Faster swing animations:
    - Reduces time between sweep start and end.
    - Makes melee weapons feel more responsive.
    - **For Meteor Knuckle:**
      - Can also reduce distance threshold needed to trigger the punch, effectively increasing punch frequency.