/**
 * Boot scene. Preloads car sprites + track-side art, waits for web fonts, then
 * hands off to the menu.
 */
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Kenney Racing Pack (CC0) — cars.
    this.load.setPath('assets/kenney');
    this.load.image('car-yellow', 'car-yellow.png');
    this.load.image('car-green', 'car-green.png');
    this.load.image('car-blue', 'car-blue.png');
    this.load.image('car-red', 'car-red.png');

    // Kenney Racing Kit (CC0) — top-down road tiles + track-side deco, rendered
    // by the kit pipeline (Task 1). Key = filename without extension.
    this.load.setPath('assets/kit');
    const kitKeys = [
      'barrierRed', 'barrierWhite', 'billboard', 'billboardLow', 'grandStand',
      'grandStandAwning', 'grandStandCovered', 'lightColored', 'lightPostModern',
      'pitsGarage', 'pitsOffice', 'pylon', 'roadCornerSmall',
      'roadStart', 'roadStartPositions', 'roadStraight', 'tentLong',
      'tentRoofDouble', 'treeLarge', 'treeSmall',
    ];
    for (const key of kitKeys) this.load.image(key, `${key}.png`);
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
