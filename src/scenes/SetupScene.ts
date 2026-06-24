/**
 * Car setup. The current human spends a fixed point budget across five stats
 * before drawing. On confirm it hands off to DrawScene for the same human.
 *
 * Flow: Menu → [Setup → Draw] per human → Race. State lives in the registry.
 */
import Phaser from 'phaser';
import { COLORS, DESIGN, SETUP } from '../config/constants';
import type { Loadout, RaceBuild, StatKey } from '../core/types';
import { STAT_KEYS, STAT_LABELS, defaultLoadout, loadoutTotal } from '../core/CarStats';
import { makeButton } from '../ui/Button';
import { save } from '../data/SaveManager';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** Short one-liners shown under each stat. */
const STAT_HINTS: Record<StatKey, string> = {
  grip: 'meno slittamento, curve veloci',
  speed: 'punta piu alta sui dritti',
  brake: 'rallenta meglio in curva',
  accel: 'riprende prima dopo le curve',
  offroad: 'tollera piu uscite di pista',
};

export class SetupScene extends Phaser.Scene {
  private build!: RaceBuild;
  private loadout: Loadout = defaultLoadout();

  private budgetText!: Phaser.GameObjects.Text;
  private pipGraphics!: Phaser.GameObjects.Graphics;
  private plusBtns: Phaser.GameObjects.Container[] = [];
  private minusBtns: Phaser.GameObjects.Container[] = [];

  constructor() {
    super('Setup');
  }

  init(): void {
    this.build = this.registry.get('raceBuild') as RaceBuild;
    // Player (human 0) resumes their last saved build; others start fresh.
    this.loadout =
      this.build.currentHuman === 0 ? save.getLoadout() : defaultLoadout();
    this.plusBtns = [];
    this.minusBtns = [];
  }

  create(): void {
    const cx = DESIGN.width / 2;
    const label = `P${this.build.currentHuman + 1}`;

    this.add
      .text(cx, 36, `${label} — CONFIGURA AUTO`, {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: hex(COLORS.trackBorder),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.budgetText = this.add
      .text(cx, 84, '', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: hex(COLORS.accent),
      })
      .setOrigin(0.5);

    this.pipGraphics = this.add.graphics().setDepth(5);

    // One row per stat: label + hint, − button, level pips, + button.
    const rowY = (i: number) => 150 + i * 92;
    STAT_KEYS.forEach((key, i) => {
      const y = rowY(i);
      this.add
        .text(150, y - 12, STAT_LABELS[key], {
          fontFamily: 'monospace',
          fontSize: '26px',
          color: hex(COLORS.textPrimary),
        })
        .setOrigin(0, 0.5);
      this.add
        .text(150, y + 16, STAT_HINTS[key], {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: hex(COLORS.textDim),
        })
        .setOrigin(0, 0.5);

      this.minusBtns[i] = makeButton(this, 760, y, 70, 64, '−', () => this.change(key, -1));
      this.plusBtns[i] = makeButton(this, 1120, y, 70, 64, '+', () => this.change(key, +1), COLORS.accent);
    });

    makeButton(this, cx, DESIGN.height - 60, 360, 84, 'CONFERMA', () => this.confirm(), COLORS.accent);

    this.refresh();
  }

  private change(key: StatKey, delta: number): void {
    const next = this.loadout[key] + delta;
    if (next < 0 || next > SETUP.maxLevel) return;
    if (delta > 0 && loadoutTotal(this.loadout) >= SETUP.budget) return; // budget spent
    this.loadout[key] = next;
    this.refresh();
  }

  /** Redraw pips, budget counter and dim buttons at their bounds. */
  private refresh(): void {
    const spent = loadoutTotal(this.loadout);
    this.budgetText.setText(`PUNTI: ${spent}/${SETUP.budget}`);

    const g = this.pipGraphics;
    g.clear();
    const rowY = (i: number) => 150 + i * 92;
    STAT_KEYS.forEach((key, i) => {
      const y = rowY(i);
      const lvl = this.loadout[key];
      for (let p = 0; p < SETUP.maxLevel; p++) {
        const px = 870 + p * 60;
        if (p < lvl) {
          g.fillStyle(COLORS.trackBorder, 1);
          g.fillCircle(px, y, 16);
        } else {
          g.lineStyle(3, COLORS.textDim, 0.8);
          g.strokeCircle(px, y, 16);
        }
      }
      // Dim − at 0, + when at max level or budget spent.
      this.minusBtns[i].setAlpha(lvl <= 0 ? 0.4 : 1);
      const plusBlocked = lvl >= SETUP.maxLevel || spent >= SETUP.budget;
      this.plusBtns[i].setAlpha(plusBlocked ? 0.4 : 1);
    });
  }

  private confirm(): void {
    const b = this.build;
    b.humanLoadouts[b.currentHuman] = this.loadout;
    if (b.currentHuman === 0) save.setLoadout(this.loadout); // remember the player's build
    this.registry.set('raceBuild', b);
    this.scene.start('Draw');
  }
}
