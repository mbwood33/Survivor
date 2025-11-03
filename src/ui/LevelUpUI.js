import Phaser from 'phaser';

// Simple modal UI that shows 3 upgrade choices and a reroll button.
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
    this.back = scene.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0, 0);
    this.container.add(this.back);

    // Panel
    const panelW = 760, panelH = 360;
    const panel = scene.add.rectangle(width/2, height/2, panelW, panelH, 0x111418, 0.95).setStrokeStyle(2, 0xffffff, 0.15);
    this.container.add(panel);

    const title = scene.add.text(width/2, height/2 - panelH/2 + 28, 'Level Up!', { fontFamily:'monospace', fontSize: 28, color:'#ffffff' }).setOrigin(0.5);
    this.container.add(title);

    // Choice cards
    this.cards = [];
    const gap = 20; const cardW = (panelW - gap*4) / 3; const cardH = 180;
    const y = height/2 - 30;
    for (let i = 0; i < 3; i++) {
      const x = width/2 - panelW/2 + gap + (cardW + gap) * i + cardW/2;
      const c = this._makeCard(x, y, cardW, cardH, this.choices[i], i);
      this.cards.push(c);
      this.container.add(c.root);
    }

    // Reroll button / hint
    this.rerollText = scene.add.text(width/2, height/2 + panelH/2 - 32, '', { fontFamily:'monospace', fontSize: 16, color:'#cccccc' }).setOrigin(0.5);
    this.container.add(this.rerollText);
    this._refreshRerollText();

    // Keyboard shortcuts
    this.keys = scene.input.keyboard.addKeys({ ONE: 'ONE', TWO: 'TWO', THREE: 'THREE', R: 'R' });
    this._keyHandler = this._onKeyDown.bind(this);
    scene.input.keyboard.on('keydown', this._keyHandler);
  }

  _makeCard(cx, cy, w, h, upgrade, index) {
    const root = this.scene.add.container(cx, cy);
    const color = upgrade ? (upgrade.tier === 'rare' ? 0x2f9e44 : upgrade.tier === 'uncommon' ? 0x4dabf7 : 0xffffff) : 0x888888;
    const rect = this.scene.add.rectangle(0, 0, w, h, 0x20252a, 0.95).setStrokeStyle(2, color, 0.9);
    rect.setInteractive({ useHandCursor: !!upgrade });
    const label = this.scene.add.text(0, -h*0.35, upgrade ? upgrade.tier.toUpperCase() : '-', { fontFamily:'monospace', fontSize: 14, color:'#aaaaaa' }).setOrigin(0.5);
    const text = this.scene.add.text(0, 0, upgrade ? upgrade.text : '—', { fontFamily:'monospace', fontSize: 18, color:'#ffffff', align:'center', wordWrap: { width: w - 24 } }).setOrigin(0.5);
    const hint = this.scene.add.text(0, h*0.35, `Select (${index+1})`, { fontFamily:'monospace', fontSize: 14, color:'#999999' }).setOrigin(0.5);
    root.add([rect, label, text, hint]);

    if (upgrade) {
      rect.on('pointerover', () => rect.setFillStyle(0x242a30, 0.98));
      rect.on('pointerout', () => rect.setFillStyle(0x20252a, 0.95));
      rect.on('pointerdown', () => this._choose(index));
    }

    return { root, rect, label, text, hint };
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
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      const upg = choices[i];
      const color = upg ? (upg.tier === 'rare' ? 0x2f9e44 : upg.tier === 'uncommon' ? 0x4dabf7 : 0xffffff) : 0x888888;
      c.rect.setStrokeStyle(2, color, 0.9);
      c.label.setText(upg ? upg.tier.toUpperCase() : '-');
      c.text.setText(upg ? upg.text : '—');
      c.rect.removeAllListeners();
      if (upg) {
        c.rect.setInteractive({ useHandCursor: true });
        c.rect.on('pointerover', () => c.rect.setFillStyle(0x242a30, 0.98));
        c.rect.on('pointerout', () => c.rect.setFillStyle(0x20252a, 0.95));
        c.rect.on('pointerdown', () => this._choose(i));
      } else {
        c.rect.disableInteractive();
      }
    }
    this._refreshRerollText();
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

