# Milestone 10 - Modification and refinements for weapon system and level-up system

- Eventually, more than one playable character will be added to the game.
- Each character will have their own "base weapon."

# Weapon Slots

- There will be 3 weapon slots that the player can gain from leveling up.
- The first weapon slot will be the base weapon.
- The player can get new weapons when leveling up (it can be one of the options to choose from when leveling up)
- After the 3 weapon slots are filled, no more new weapons will show up in the level-up menu.
- The player can increase the stats of the weapon from power-up options when leveling up.
- Each weapon will eventually have a sprite dedicated to it to display on the level-up screen as well as the game screen to show which weapons have been selected.

# Talent Slots

- Power ups will be called "talents."
- There will be 3 talent slots that the player can gain from leveling up.
- The player can get new talent when leveling up (it can be one of the options to choose from when leveling up)
- After the 3 talent slots are filled, no more new talents will show up in the level-up menu.
- The talents will be:
  - **Spright:** Increases movement speed
  - **Enbiggen:** Increases size of attacks, projectiles, AoE radius, etc.
  - **Barrier:** Adds/increases shield - shield takes damage instead of player losing HP before it breaks; shield regenerates quickly after not taking damage for a while
  - **Restore:** Increases HP regeneration rate
  - **Accelerate:** Increases projectile speed
  - **Sharpen:** Increases crit chance (more then 100% crit chance lets you "overcrit", dealing even more damage)
  - **Maximize:** Increases max HP
  - **Elude:** Increases chance of dodging attacks, avoiding damage completely
  - **Amplify:** Increases damage dealt ("base damage")
  - **Haste:** Decreases cooldown of attacks/increases attack rate
  - **Deflect:** Reflects damage back to the attacker when hit
  - **Drain:** Increases your chance to heal for 1 when you hit an enemy. Over 100% will guarantee 1 heal, and give a chance to heal for a total of 2.
  - **Magnetize:** Increases the radius of attraction for XP orbs
  - **Fortify:** Increases "armor"/reduces damage taken
  - **Sustain:** Increases duration of attacks and distance projectiles travel before despawning
  - **Enlighten:** Gives you more XP from all sources
  - **Afflict:** Increases enemy quantity, health, speed, and strength
  - **Derange:** Boosts a random talent (randomly selected from the 3 power-up slots)
  - **Auspicate:** Increases your "luck" - i.e., your chance to get higher tier offers when leveling up
- They will eventually have a sprite dedicated to each of them to display on the level-up screen as well as the game screen to show which talents have been selected.

# Upgrade level-up system/implement new weapon system

- Currently, the level-up system is obselete, created for the old level-up system.
- E.g., increasing attack speed currently actually *increases* the cooldown of attacks instead of decreasing it (i.e., the attacks are slower rather than faster)
- The new weapons system is also currently not implemented, so the player cannot upgrade their weapon stats or get new weapons