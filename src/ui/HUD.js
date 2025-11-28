// Basic HUD: displays level and a simple XP bar.

export class HUD {
  constructor(scene) {
    this.scene = scene;
    const gw = scene.game.config.width;
    const gh = scene.game.config.height;
    this.container = scene.add.container(gw / 2, gh - 8).setScrollFactor(0).setDepth(1000);

    // Level text at bottom left
    this.levelText = scene.add.text(10, gh - 10, "Lv 1", { fontFamily: "monospace", fontSize: 14, color: "#ffffff" })
      .setScrollFactor(0)
      .setDepth(1000)
      .setOrigin(0, 0.5);
    // this.container.add(this.levelText); // Removed from centered container

    const barW = 220; const barY = 0;
    this.barBg = scene.add.rectangle(0, barY, barW, 8, 0x333333).setOrigin(0.5, 0.5);
    this.barFg = scene.add.rectangle(0, barY, barW, 8, 0x4cc9f0).setOrigin(0.5, 0.5);
    this.container.add([this.barBg, this.barFg]);
  }

  updateFromPlayer(player) {
    this.levelText.setText(`Lv ${player.level}`);
    const pct = Math.max(0, Math.min(1, player.xp / player.xpForNext));
    this.barFg.width = this.barBg.width * pct;
  }
}