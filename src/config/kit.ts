/** Kit render pipeline constants (measured, do not guess). */
export const KIT = {
  /** Pipeline render scale: pixels per kit world unit (road tile = 1 unit). */
  pxPerUnit: 256,
  /** Paved road-surface width of roadStraight.png as a fraction of the tile,
   * measured on the rendered PNG's center row. The model bundles its own
   * opaque grass verge all the way to the tile edges (alpha is 255 across
   * the whole 256x256 canvas), so the brief's literal "alpha>0" test always
   * yields 1.0 and can't tell surface from verge. Instead this measures the
   * width of the non-grass band (curb + asphalt) at the center row: the
   * band runs from x=21 to x=234 of 256 (grass color is a constant
   * (110,146,130,255) on both outer edges) -> 214/256 = 0.8359375. */
  roadSurfaceFrac: 0.8359375,
} as const;

/** Canonical orientations of the rendered art (verified visually in Task 1):
 * - roadStraight: road runs VERTICALLY (travel N–S). Confirmed by sampling:
 *   the center row shows grass/curb/asphalt/curb/grass bands left-to-right,
 *   while the center column is uniform asphalt top-to-bottom.
 * - roadCornerSmall: connects the SOUTH edge to the EAST edge (NOT south
 *   and west — verified by sampling opaque pixels at the midpoint of each
 *   of the 4 canvas edges: top and left are transparent, bottom and right
 *   are opaque asphalt). The grass/curb corner cutout sits in the NW corner
 *   of the tile.
 * Rotation tables in CircuitTrack.ts must be written against these actual
 * orientations, not the south/west example in the original brief. */
