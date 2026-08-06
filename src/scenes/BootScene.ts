/**
 * Boot scene. The MVP draws everything procedurally with Graphics (no image
 * assets), so this just hands straight off to the menu. Asset preloading would
 * go here later.
 */
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Kenney Racing Pack (CC0) — cars, ground tiles, scenery.
    this.load.setPath('assets/kenney');
    this.load.image('car-yellow', 'car-yellow.png');
    this.load.image('car-green', 'car-green.png');
    this.load.image('car-blue', 'car-blue.png');
    this.load.image('car-red', 'car-red.png');
    this.load.image('grass', 'grass.png');
    this.load.image('dirt', 'dirt.png');
    this.load.image('tree-large', 'tree_large.png');
    this.load.image('tree-small', 'tree_small.png');
    this.load.image('rock1', 'rock1.png');
    this.load.image('rock2', 'rock2.png');
    this.load.image('rock3', 'rock3.png');
  }

  async create(): Promise<void> {
    // Wait for the web fonts so text renders in Orbitron/Rajdhani — but never
    // block boot more than a moment (offline / slow CDN falls back gracefully).
    const fonts = Promise.all([
      document.fonts.load('800 32px Saira'),
      document.fonts.load('600 24px Saira'),
      document.fonts.load('400 20px Saira'),
      document.fonts.load('300 20px Saira'),
    ]).catch(() => {});
    const timeout = new Promise((res) => window.setTimeout(res, 1500));
    await Promise.race([fonts, timeout]);

    // Phaser is up and fonts are ready — fade out the HTML loading screen.
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('hide');
      window.setTimeout(() => loader.remove(), 500);
    }
    this.scene.start('Menu');
  }
}
