import Phaser from 'phaser';
import { GAME } from "./config.js";
import { GameScene } from "./scenes/GameScene.js";
import { UIScene } from "./scenes/UIScene.js";

// Bootstraps the Phaser game instance with our scenes and config.
const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME.width,
  height: GAME.height,
  backgroundColor: GAME.backgroundColor,
  pixelArt: true,
  input: { gamepad: true },
  scale: {
    mode: Phaser.Scale.NONE, // keep logical size; we handle integer CSS scaling and centering
    autoCenter: Phaser.Scale.NO_CENTER,
    width: GAME.width,
    height: GAME.height,
  },
  render: {
    antialias: false,
    roundPixels: true,
  },
  scene: [GameScene, UIScene],
  physics: { default: 'arcade' }, // Arcade physics is not used directly; kept available for future
};

const game = new Phaser.Game(config);

function applyIntegerScale() {
  const canvas = game.canvas;
  if (!canvas) return;
  const ww = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
  const wh = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  const scaleX = Math.floor(ww / GAME.width);
  const scaleY = Math.floor(wh / GAME.height);
  const factor = Math.max(1, Math.min(scaleX, scaleY));
  const displayW = GAME.width * factor;
  const displayH = GAME.height * factor;
  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;
  // Absolute-center the canvas to avoid any layout quirks
  canvas.style.position = 'absolute';
  canvas.style.left = '50%';
  canvas.style.top = '50%';
  canvas.style.transform = 'translate(-50%, -50%)';
}

window.addEventListener('resize', applyIntegerScale);
window.addEventListener('orientationchange', applyIntegerScale);
// Apply on first frame so canvas exists
requestAnimationFrame(applyIntegerScale);
