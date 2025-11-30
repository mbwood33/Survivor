# Milestone 9 - Revision of Difficulty Scaling System and Damage System
11/29/2025

# Difficulty Scaling System

## 1. Goals

The difficulty system should:

- Scale primarily with **time elapsed** (like classic survivor-likes).
- Let players **opt into extra difficulty** by interacting with **Difficulty Shrines** in exchange for rewards.
- Be **data-driven**: a few global difficulty variables feed into enemy stats, spawn rates, elite chances, etc.
- Be easy to tweak via constants (`kTime`, `kShrine`, etc.) without rewriting logic.


## 2. Core Difficulty Variables

We track a few global values:

- `timeSeconds` – how long the run has lasted.
- `timeMinutes = timeSeconds / 60`.
- `shrineCount` – number of difficulty shrines the player has activated.

From these, we derive a single **Danger Rating**:

```ts
dangerBase   = fTime(timeMinutes);
dangerShrine = fShrines(shrineCount);

// total difficulty “score”
danger = (dangerBase) * (1 + dangerShrine);
```

All other systems (enemy HP, damage, spawn frequency, elite chance) read from `danger`.

## 3. Time-Based Difficulty: fTime(t)
We want difficulty to feel:
- Gentle early on
- Noticeable ramp mid-game
- Heavier late-game without instantly becoming impossible
- A simple and flexible curve:

```ts
// t = timeMinutes
fTime(t) = base + (kLinear * t) + (kQuadratic * t * t);

// Example constants:
base        = 1.0;
kLinear     = 0.4;
kQuadratic  = 0.03;
```

Examples (with those values):
- **At 0 min:** dangerBase = 1.0
- **At 5 min:** 1.0 + 0.4*5 + 0.03*25 = 1.0 + 2.0 + 0.75 = 3.75
- **At 10 min:** 1.0 + 4.0 + 3.0 = 8.0
- **At 15 min:** 1.0 + 6.0 + 6.75 = 13.75
You can tweak kLinear and kQuadratic to adjust how quickly things escalate.

## 4. Shrine-Based Difficulty: fShrines(s)

Each Difficulty Shrine gives a reward (e.g. gold, chest, permanent stat buff) but permanently increases difficulty.

We want shrines to be significant but not instantly lethal, and the impact to grow slightly the more you take.

```ts
// s = shrineCount
// Basic idea: each shrine adds ~25–40% more difficulty, with mild curve.

fShrines(s) = s * shrineStep + s * s * shrineCurve;

// Example:
shrineStep  = 0.30;  // +30% difficulty per shrine
shrineCurve = 0.05;  // extra curve for repeated greed

// Then we treat this as a multiplier: (1 + fShrines(s))
difficultyShrineMultiplier = 1 + fShrines(shrineCount);
```

Example values:
- 0 shrines: `fShrines(0) = 0` --> multiplier 1.0
- 1 shrine: `fShrines(1) = 0.30 + 0.05 = 0.35` --> 1.35x
- 2 shrines: `fShrines(2) = 0.60 + 0.20 = 0.80` --> 1.80x
- 3 shrines: `fShrines(3) = 0.90 + 0.45 = 1.35` --> 2.35x
So "just one more shrine" really starts to matter.

## 5. Final Danger Formula
Putting it all together:
```ts
// Input:
timeMinutes // from game clock
shrineCount // from shrine interactions

// 1) Time compomnent
dangerBase = base + kLinear * timeMinutes + kQuadratic * timeMinutes * timeMinutes;

// 2) Shrine component
dangerShrine = shrineCount * shrineStep + shrineCount * shrineCount * shrineCurve;

// 3) Final danger
danger = dangerBase * (1 + dangerShrine);
```

## 6. Mapping Danger --> Game Parameters
Once we have `danger`, we use it to scale various systems.

### 6.1. Enemy Health
```ts
// hpBase: base HP for that enemy type
// hpScaleExponent: makes HP grow faster than linearly (e.g., 1.1-1.4)

enemyHp = hpBase * Math.pow(1 + kHp * danger, hpScaleExponent);

// Example constants
kHp             = 0.12;
hpScaleExponent = 1.25;
```

### 6.2. Enemy Damage
Damage should scale, but usually slower than HP to keep things survivable.

```ts
// dmgBase: base damage for that enemy type
enemyDamage = dmgBase * (1 + kDmg * Math.sqrt(danger));

// Example:
kDmg = 0.20;
```

Using `sqrt(danger)` keeps damage from going absolutely feral too fast.

### 6.3. Spawn Rate & Density

- Spawn interval shrinks as danger increases.
- Max enemies on screen grows as danger increases.

```ts
// baseSpawnInterval: in seconds
// minSpawnInterval: clamp value
spawnInterval = baseSpawnInterval / (1 + kSpawn * danger);
spawnInterval = Math.max(spawnInterval, minSpawnInterval);

// Example:
baseSpawnInterval = 1.0;    // spawns every 1s at start
kSpawn = 0.08;
minSpawnInterval = 0.15;

// Max enemies on screen:
maxEnemies = baseMaxEnemies + Math.floor(kMaxEnemies * danger);

// Example:
baseMaxEnemies = 40;
kMaxEnemies = 2.5;  // +2-3 enemies per danger unit
```

### 6.4. Elite/Champion Chance
```ts
eliteChance = eliteBase + kElite * danger;

// Clamp:
eliteChance = Math.min(eliteChance, eliteMax);

// Example:
eliteBase = 0.02;   // 2%
kElite = 0.01;      // +1% per danger unit
eliteMax = 0.40;    // cap at 40%
```

### 6.5. Enemy Tier Unlocks
You can define danger thresholds to unlock new enemy types.

```ts
if (danger >= 3) enableEnemyTier(1);
if (danger >= 7) enableEnemyTier(2);
if (danger >= 12) enableEnemyTier(3);
if (danger >= 18) enableEnemyTier(4);
```
This makes the gaem feel like it's introducing new threats as you survive longer or take shrines.

## 7. Implementation Strategy

### 7.1. DifficultyState Object
Have a single object managed by your main scene/game manager:
```ts
interface DifficultyState {
    timeSeconds: number;
    shrineCount: number;
    
    danger: number;
}

const difficulty: DifficultyState = {
    timeSeconds: 0,
    shrineCount: 0,
    danger: 1,
};
```

Update once per frame or once per second:
```ts
updateDifficulty(deltaSeconds: number) {
    difficulty.timeSeconds += deltaSeconds;
    const t = difficulty.timeSeconds / 60;

    const dangerBase = base + kLinear * t + KQuadratic * t * t;
    const shrineTerm = difficulty.shrineCount * shrineStep + difficulty.shrineCount * difficulty.shrineCount * shrineCurve;
    
    difficulty.danger = dangerBase * (1 + shrineTerm);
}
```

### 7.2. Using Danger in Spawners
Your enemy spawner can periodically read `difficulty.danger` and:
- Recalculate `spawnInterval`
- Adjust `maxEnemies`
- Decide which enemy tiers are eligible
- Decide if the next spawn is normal/elite/miniboss

### 7.3. Using Danger in Enemy Stats
When you spawn an enemy:
- Compute its current HP & damage using the formulas and the **current danger** value
- Store those on the enemy instance (`hp`, `maxHp`, `damage`).
This way, enemies spawned later in the run are naturally stronger, even if earlier ones are still alive

## 8. Tuning & Debugging

### 8.1. Developer Debug UI
For tuning, it helps to display:
- Current time
- Shrine count
- Danger value
- Spawn interval
- Max enemies
You can add a simple debug overlay (text) in Phaser to watch these values while playing.

### 10.2. Simple Balance Strategy
1. Start with:
  - Shrines disabled: see if time-based scaling alone feels good.
2. Add shrines:
  - Tune `shrineStep` and `shrineCurve` until taking 1-2 shrines feels rewarding but survivable
3. Adjust HP scalilng:
  - If enemies feel too spongy, lower `kHp` or `hpScaleExponent`
4. Adjust damage scaling:
  - If you die too quickly late game, reduce `kDmg` or make damage scale slower (e.g., `log` or `sqrt`)
5. Adjust spawn interval & max enemies:
  - Ensure it doesn't become unwinnable purely because of filling the screen with unavoidable bodies.