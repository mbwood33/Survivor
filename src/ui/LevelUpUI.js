import Phaser from 'phaser';

export class LevelUpUI {
  constructor(scene, opts) {
    this.scene = scene;
    this.onChoose = opts.onChoose; // (upgrade) => void
    this.onReroll = opts.onReroll; // () => void
    this.getRerollsLeft = opts.getRerollsLeft; // () => number
    this.choices = opts.choices || [];

    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(2000);
    const { width, height } = scene.game.config;

    // Backdrop
    this.back = scene.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0, 0);
    this.container.add(this.back);

    // Main Layout: Wider panel to fit side stats
    // Left side (Cards): 60%, Right side (Stats): 40%
    const panelW = Math.min(900, width - 40);
    const panelH = Math.min(500, height - 40);
    const panelX = width / 2;
    const panelY = height / 2;

    // Main Panel Background
    const panel = scene.add.rectangle(panelX, panelY, panelW, panelH, 0x111418, 0.95).setStrokeStyle(2, 0xffffff, 0.15);
    this.container.add(panel);

    const title = scene.add.text(panelX, panelY - panelH / 2 + 24, 'LEVEL UP!', { fontFamily: 'monospace', fontSize: 28, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.container.add(title);

    // Divider
    const splitX = panelX + panelW * 0.15; // Split point
    const divider = scene.add.line(0, 0, splitX, panelY - panelH / 2 + 60, splitX, panelY + panelH / 2 - 20, 0xffffff, 0.1).setOrigin(0);
    this.container.add(divider);

    // --- Left Side: Cards ---
    this.cards = [];
    const leftW = (panelW * 0.65) - 40;
    const leftX = panelX - panelW / 2 + 20 + leftW / 2;
    const cardGap = 16;
    const cardW = leftW;
    const cardH = 80; // Horizontal strips instead of vertical cards? Or just fit 3 vertically?
    // Let's stick to 3 vertical cards side-by-side in the left area for familiarity, but maybe smaller?
    // Actually, vertical list might be better if we have descriptions.
    // Let's try 3 columns in the left area.
    const colW = (leftW - cardGap * 2) / 3;
    const colH = Math.min(300, panelH - 100);
    const cardY = panelY + 10;

    for (let i = 0; i < 3; i++) {
      const cx = panelX - panelW / 2 + 30 + colW / 2 + (colW + cardGap) * i;
      const c = this._makeCard(cx, cardY, colW, colH, this.choices[i], i);
      this.cards.push(c);
      this.container.add(c.root);
    }

    // --- Right Side: Stats Panel ---
    const rightW = (panelW * 0.35) - 40;
    const rightX = splitX + 20 + rightW / 2;
    const statsY = panelY - panelH / 2 + 80;

    this.statsTitle = scene.add.text(rightX, statsY, 'CURRENT STATS', { fontFamily: 'monospace', fontSize: 16, color: '#888888' }).setOrigin(0.5);
    this.container.add(this.statsTitle);

    this.statsText = scene.add.text(rightX, statsY + 30, '', {
      fontFamily: 'monospace', fontSize: 10, color: '#cccccc', lineSpacing: 4, align: 'left'
    }).setOrigin(0.5, 0);
    this.container.add(this.statsText);

    // Reroll button
    this.rerollText = scene.add.text(panelX, panelY + panelH / 2 - 30, '', { fontFamily: 'monospace', fontSize: 14, color: '#aaaaaa' }).setOrigin(0.5);
    this.container.add(this.rerollText);
    this._refreshRerollText();

    // Initial stats update
    this._updatePreview(null);

    // Keyboard shortcuts
    this.keys = scene.input.keyboard.addKeys({ ONE: 'ONE', TWO: 'TWO', THREE: 'THREE', R: 'R' });
    this._keyHandler = this._onKeyDown.bind(this);
    scene.input.keyboard.on('keydown', this._keyHandler);
  }

  _makeCard(cx, cy, w, h, upgrade, index) {
    const root = this.scene.add.container(cx, cy);
    const color = upgrade ? (
      upgrade.tier === 'ultra' ? 0xff6b6b :
        upgrade.tier === 'super' ? 0x2f9e44 :
          upgrade.tier === 'rare' ? 0x4dabf7 : 0xffffff
    ) : 0x888888;

    const rect = this.scene.add.rectangle(0, 0, w, h, 0x20252a, 0.95).setStrokeStyle(2, color, 0.9);
    rect.setInteractive({ useHandCursor: !!upgrade });

    // Tier Label (Top Right)
    const tierLabel = this.scene.add.text(w / 2 - 8, -h / 2 + 8, upgrade ? upgrade.tier.toUpperCase() : '', {
      fontFamily: 'monospace', fontSize: 10, color: color
    }).setOrigin(1, 0);

    // Name (Top Center/Large)
    const nameText = this.scene.add.text(0, -h * 0.25, upgrade ? (upgrade.name || 'Unknown') : '-', {
      fontFamily: 'monospace', fontSize: 16, color: '#ffffff', fontStyle: 'bold', wordWrap: { width: w - 10 }
    }).setOrigin(0.5);

    // Description (Center)
    const descText = this.scene.add.text(0, h * 0.1, upgrade ? upgrade.text : '—', {
      fontFamily: 'monospace', fontSize: 12, color: '#aaaaaa', align: 'center', wordWrap: { width: w - 16 }
    }).setOrigin(0.5);

    // Hint (Bottom)
    const hint = this.scene.add.text(0, h / 2 - 12, `Select (${index + 1})`, {
      fontFamily: 'monospace', fontSize: 10, color: '#666666'
    }).setOrigin(0.5);

    root.add([rect, tierLabel, nameText, descText, hint]);

    // Store references on the rect for easy access in updateChoices
    // Actually, better to return them in the object and store in this.cards

    if (upgrade) {
      rect.on('pointerover', () => {
        rect.setFillStyle(0x2a323b, 1);
        this._updatePreview(upgrade);
      });
      rect.on('pointerout', () => {
        rect.setFillStyle(0x20252a, 0.95);
        this._updatePreview(null);
      });
      rect.on('pointerdown', () => this._choose(index));
    }

    return { root, rect, tierLabel, nameText, descText, hint };
  }

  _updatePreview(upgrade) {
    const player = this.scene.player;
    const weaponMgr = this.scene.weaponManager;

    // Clone stats
    const stats = { ...player.stats };
    let weaponUpgradeId = null;
    let newWeaponId = null;

    // Apply preview
    if (upgrade) {
      if (upgrade.type === 'talent_upgrade' || upgrade.type === 'new_talent') {
        if (upgrade.def && typeof upgrade.def.apply === 'function') {
          // Create a dummy scene/player context if needed, but usually apply just mods stats
          // Warning: 'afflict' modifies scene.difficulty, we should ignore side effects for preview
          if (upgrade.id !== 'afflict' && upgrade.id !== 'derange') {
            upgrade.def.apply(stats, this.scene, player);
          }
        }
      } else if (upgrade.type === 'weapon_upgrade') {
        weaponUpgradeId = upgrade.id;
      } else if (upgrade.type === 'new_weapon') {
        newWeaponId = upgrade.id;
      }
    }

    // Calculate DPS
    // Ensure getEstimatedDPS exists, otherwise fallback
    let dps = 0;
    if (typeof weaponMgr.getEstimatedDPS === 'function') {
      dps = weaponMgr.getEstimatedDPS(stats, weaponUpgradeId, newWeaponId);
    }

    // Format Text
    const fmt = (lbl, val, baseVal) => {
      const diff = val - baseVal;
      const color = diff > 0.001 ? '#00ff00' : (diff < -0.001 ? '#ff0000' : '#cccccc');
      const arrow = diff > 0.001 ? '▲' : (diff < -0.001 ? '▼' : '');
      // Round for display
      const vStr = Number.isInteger(val) ? val : val.toFixed(1);
      return `${lbl}: ${vStr} ${arrow}`; // Simplified formatting
    };

    // We need comparison if upgrade is active
    // Actually, let's just show the PREDICTED values.
    // If upgrade is null, it shows current.
    // If upgrade is active, it shows predicted.
    // Maybe highlight changed values?

    const lines = [
      `DPS:         ${dps.toFixed(0)}`,
      `Max HP:      ${(player.hpMax * (upgrade ? (stats.maxHpMult || 1) / (player.stats.maxHpMult || 1) : 1)).toFixed(0)}`, // Rough est
      `Regen:       ${stats.regen.toFixed(1)}/s`,
      `Armor:       ${stats.armor.toFixed(0)}`,
      `Move Spd:    ${(stats.moveSpeed * 100).toFixed(0)}%`,
      `Might:       ${(stats.damage * 100).toFixed(0)}%`,
      `Cooldown:    -${(stats.attackSpeed * 100).toFixed(0)}%`, // Attack speed reduces cooldown
      `Crit Rate:   ${(stats.critChance * 100).toFixed(0)}%`,
      `Area:        ${(stats.projSize * 100).toFixed(0)}%`,
      `Speed:       ${(stats.projectileSpeed * 100).toFixed(0)}%`,
      `Magnet:      ${(stats.magnet * 100).toFixed(0)}%`,
      `Luck:        ${(stats.luck * 100).toFixed(0)}%`,
    ];

    this.statsText.setText(lines.join('\n'));

    if (upgrade) {
      this.statsTitle.setText("PREVIEW");
      this.statsTitle.setColor('#00ff00');
    } else {
      this.statsTitle.setText("CURRENT STATS");
      this.statsTitle.setColor('#888888');
    }
  }

  _choose(idx) {
    const upg = this.choices[idx];
    if (!upg) return;
    this.onChoose && this.onChoose(upg);
    this.destroy();
  }

  _onKeyDown(ev) {
    if (ev.code === 'Digit1' || ev.code === 'Numpad1') this._choose(0);
    else if (ev.code === 'Digit2' || ev.code === 'Numpad2') this._choose(1);
    else if (ev.code === 'Digit3' || ev.code === 'Numpad3') this._choose(2);
    else if ((ev.code === 'KeyR' || ev.code === 'R') && this.getRerollsLeft() > 0) {
      this.onReroll && this.onReroll();
      this._refreshRerollText();
    }
  }

  updateChoices(choices) {
    this.choices = choices;
    // Recreate cards? Or update them?
    // Update is better for performance, but structure might change.
    // Let's just update text/callbacks.
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      const upg = choices[i];
      const color = upg ? (
        upg.tier === 'ultra' ? 0xff6b6b :
          upg.tier === 'super' ? 0x2f9e44 :
            upg.tier === 'rare' ? 0x4dabf7 : 0xffffff
      ) : 0x888888;

      c.rect.setStrokeStyle(2, color, 0.9);
      c.tierLabel.setText(upg ? upg.tier.toUpperCase() : '');
      c.tierLabel.setColor(typeof color === 'number' ? '#' + color.toString(16) : color);
      c.nameText.setText(upg ? (upg.name || 'Unknown') : '-');
      c.descText.setText(upg ? upg.text : '—');

      c.rect.removeAllListeners();
      if (upg) {
        c.rect.setInteractive({ useHandCursor: true });
        c.rect.on('pointerover', () => {
          c.rect.setFillStyle(0x2a323b, 1);
          this._updatePreview(upg);
        });
        c.rect.on('pointerout', () => {
          c.rect.setFillStyle(0x20252a, 0.95);
          this._updatePreview(null);
        });
        c.rect.on('pointerdown', () => this._choose(i));
      } else {
        c.rect.disableInteractive();
      }
    }
    this._refreshRerollText();
    this._updatePreview(null);
  }

  _refreshRerollText() {
    const r = this.getRerollsLeft ? this.getRerollsLeft() : 0;
    this.rerollText.setText(`Reroll (R): ${r} left`);
  }

  destroy() {
    this.scene.input.keyboard.off('keydown', this._keyHandler);
    this.container.destroy(true);
  }
}
