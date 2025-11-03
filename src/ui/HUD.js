// Basic HUD: displays level and a simple XP bar.

export class HUD {
  constructor(scene) {
    this.scene = scene;
    this.container = scene.add.container(16, 16).setScrollFactor(0).setDepth(1000);

    this.levelText = scene.add.text(0, 0, "Lv 1", { fontFamily: "monospace", fontSize: 18, color: "#ffffff" });
    this.container.add(this.levelText);

    this.barBg = scene.add.rectangle(0, 28, 240, 12, 0x333333).setOrigin(0, 0.5);
    this.barFg = scene.add.rectangle(0, 28, 240, 12, 0x4cc9f0).setOrigin(0, 0.5);
    this.container.add([this.barBg, this.barFg]);
  }

  updateFromPlayer(player) {
    this.levelText.setText(`Lv ${player.level}`);
    const pct = Math.max(0, Math.min(1, player.xp / player.xpForNext));
    this.barFg.width = 240 * pct;
  }
}

