/**
 * Car setup. The current human spends a fixed point budget across five stats
 * before drawing. On confirm it hands off to DrawScene for the same human.
 *
 * Flow: Menu → [Setup → Draw] per human → Race. State lives in the registry.
 */
import Phaser from 'phaser';
import { COLORS, DESIGN, SETUP, STAT_COLORS } from '../config/constants';
import type { Loadout, RaceBuild, StatKey } from '../core/types';
import { STAT_KEYS, STAT_LABELS, defaultLoadout, loadoutTotal } from '../core/CarStats';
import { makeButton } from '../ui/Button';
import { addBackground, displayStyle, bodyStyle, glow } from '../ui/theme';
import { save } from '../data/SaveManager';

/** Short one-liners shown under each stat. */
const STAT_HINTS: Record<StatKey, string> = {
  grip: 'meno slittamento, curve veloci',
  speed: 'punta piu alta sui dritti',
  brake: 'rallenta meglio in curva',
  accel: 'riprende prima dopo le curve',
  offroad: 'tollera piu uscite di pista',
};

const ROW_Y = (i: number) => 168 + i * 96;
const CARD_X = 150;
const CARD_W = DESIGN.width - 300;
const CARD_RIGHT = CARD_X + CARD_W;
const SEG_W = 46;
const SEG_H = 30;
// Controls are right-anchored to the (width-responsive) card so they line up
// against the right edge on any screen aspect, with the label/hint on the left.
// Packed right→left (+ button, three segments, − button) with even gaps.
const PLUS_X = CARD_RIGHT - 46;
const SEG_X = [0, 1, 2].map((s) => PLUS_X - 78 - (2 - s) * 60);
const MINUS_X = SEG_X[0] - 78;

export class SetupScene extends Phaser.Scene {
  private build!: RaceBuild;
  private loadout: Loadout = defaultLoadout();

  private budgetText!: Phaser.GameObjects.Text;
  private budgetBar!: Phaser.GameObjects.Graphics;
  private segG!: Phaser.GameObjects.Graphics;
  private plusBtns: Phaser.GameObjects.Container[] = [];
  private minusBtns: Phaser.GameObjects.Container[] = [];

  constructor() {
    super('Setup');
  }

  init(): void {
    this.build = this.registry.get('raceBuild') as RaceBuild;
    this.loadout = this.build.currentHuman === 0 ? save.getLoadout() : defaultLoadout();
    this.plusBtns = [];
    this.minusBtns = [];
  }

  create(): void {
    const cx = DESIGN.width / 2;
    addBackground(this);

    const title = this.add
      .text(cx, 46, `P${this.build.currentHuman + 1} · CONFIGURA AUTO`, displayStyle(34, COLORS.trackBorder, '900'))
      .setOrigin(0.5);
    title.setLetterSpacing?.(3);
    glow(title, COLORS.trackBorder, 1.2);

    // Budget readout + bar.
    this.budgetText = this.add.text(cx, 96, '', bodyStyle(20, COLORS.accent, '700')).setOrigin(0.5, 0.5);
    this.budgetText.setLetterSpacing?.(2);
    this.budgetBar = this.add.graphics().setDepth(5);

    // Static card chrome (drawn once).
    const cards = this.add.graphics().setDepth(1);
    STAT_KEYS.forEach((key, i) => {
      const y = ROW_Y(i);
      const color = STAT_COLORS[key];
      cards.fillStyle(COLORS.panel, 0.85);
      cards.fillRoundedRect(CARD_X, y - 40, CARD_W, 80, 14);
      cards.lineStyle(1.5, COLORS.panelBorder, 0.8);
      cards.strokeRoundedRect(CARD_X, y - 40, CARD_W, 80, 14);
      // Left accent stripe.
      cards.fillStyle(color, 1);
      cards.fillRoundedRect(CARD_X, y - 40, 6, 80, 3);

      const lbl = this.add
        .text(CARD_X + 28, y - 13, STAT_LABELS[key], bodyStyle(26, color, '700'))
        .setOrigin(0, 0.5);
      lbl.setLetterSpacing?.(1);
      glow(lbl, color, 0.5);
      this.add
        .text(CARD_X + 28, y + 17, STAT_HINTS[key], bodyStyle(20, COLORS.textMid, '600'))
        .setOrigin(0, 0.5);

      this.minusBtns[i] = makeButton(this, MINUS_X, y, 62, 56, '−', () => this.change(key, -1), COLORS.panelBorder);
      this.plusBtns[i] = makeButton(this, PLUS_X, y, 62, 56, '+', () => this.change(key, +1), color);
    });

    this.segG = this.add.graphics().setDepth(3);

    makeButton(this, cx, DESIGN.height - 56, 380, 84, 'CONFERMA', () => this.confirm(), COLORS.accent);

    this.refresh();
  }

  private change(key: StatKey, delta: number): void {
    const next = this.loadout[key] + delta;
    if (next < 0 || next > SETUP.maxLevel) return;
    if (delta > 0 && loadoutTotal(this.loadout) >= SETUP.budget) return;
    this.loadout[key] = next;
    this.refresh();
  }

  /** Redraw segmented level bars, budget bar, and dim buttons at their bounds. */
  private refresh(): void {
    const spent = loadoutTotal(this.loadout);
    this.budgetText.setText(`PUNTI  ${spent} / ${SETUP.budget}`);

    // Budget bar under the text.
    const bb = this.budgetBar;
    const bw = 280;
    const bx = DESIGN.width / 2 - bw / 2;
    const by = 118;
    bb.clear();
    bb.fillStyle(COLORS.panel, 1);
    bb.fillRoundedRect(bx, by, bw, 10, 5);
    bb.fillStyle(COLORS.accent, 1);
    bb.fillRoundedRect(bx, by, (bw * spent) / SETUP.budget, 10, 5);

    // Segmented bars per stat.
    const g = this.segG;
    g.clear();
    STAT_KEYS.forEach((key, i) => {
      const y = ROW_Y(i);
      const lvl = this.loadout[key];
      const color = STAT_COLORS[key];
      for (let s = 0; s < SETUP.maxLevel; s++) {
        const x = SEG_X[s] - SEG_W / 2;
        if (s < lvl) {
          g.fillStyle(color, 1);
          g.fillRoundedRect(x, y - SEG_H / 2, SEG_W, SEG_H, 6);
        } else {
          g.fillStyle(COLORS.bgBottom, 0.6);
          g.fillRoundedRect(x, y - SEG_H / 2, SEG_W, SEG_H, 6);
          g.lineStyle(1.5, COLORS.panelBorder, 0.9);
          g.strokeRoundedRect(x, y - SEG_H / 2, SEG_W, SEG_H, 6);
        }
      }
      this.minusBtns[i].setAlpha(lvl <= 0 ? 0.35 : 1);
      const plusBlocked = lvl >= SETUP.maxLevel || spent >= SETUP.budget;
      this.plusBtns[i].setAlpha(plusBlocked ? 0.35 : 1);
    });
  }

  private confirm(): void {
    const b = this.build;
    b.humanLoadouts[b.currentHuman] = this.loadout;
    if (b.currentHuman === 0) save.setLoadout(this.loadout);
    this.registry.set('raceBuild', b);
    this.scene.start('Draw');
  }
}
