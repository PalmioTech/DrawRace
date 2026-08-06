class_name Track
extends RefCounted
## Track geometry: builds a closed centerline from control points (fitted to the
## play area), plus borders, start/finish line and projection helpers.
## Ported from src/core/Track.ts.

var center: Array = []      ## Array[Vector2] — dense closed centerline (last ≈ first).
var cum: Array = []         ## Array[float]   — cumulative arc length along `center`.
var length: float = 0.0     ## Total centerline length (one lap).
var half_width: float = 58.0

var start_a: Vector2
var start_b: Vector2
var start_dir: Vector2      ## Forward direction at the start line.
var start_pos: Vector2

func _init(controls: Array, half_w: float) -> void:
	half_width = half_w
	var fitted := _fit_controls(controls, half_w + 34.0)
	var dense := Geo.sample_closed_spline(fitted, 18)
	dense.append(dense[0])  # close the loop explicitly for clean projection
	center = dense
	cum = Geo.cumulative_lengths(dense)
	length = cum[cum.size() - 1]

	start_pos = center[0]
	start_dir = (center[1] - center[0]).normalized()
	var side := Geo.perp(start_dir) * half_width
	start_a = start_pos + side
	start_b = start_pos - side

## Scale + translate control points to fill the play area (inset on all sides).
func _fit_controls(controls: Array, inset: float) -> Array:
	var min_x := INF
	var max_x := -INF
	var min_y := INF
	var max_y := -INF
	for p in controls:
		min_x = min(min_x, p.x)
		max_x = max(max_x, p.x)
		min_y = min(min_y, p.y)
		max_y = max(max_y, p.y)
	var sx := (GameConst.PLAY_W - 2.0 * inset) / (max_x - min_x)
	var sy := (GameConst.PLAY_H - 2.0 * inset) / (max_y - min_y)
	var out: Array = []
	for p in controls:
		out.append(Vector2(
			GameConst.PLAY_X + inset + (p.x - min_x) * sx,
			GameConst.PLAY_Y + inset + (p.y - min_y) * sy
		))
	return out

## Project a point onto the centerline. Returns { dist, s, index }.
func project(p: Vector2) -> Dictionary:
	return Geo.project_to_polyline(p, center, cum)

## Point on the centerline at arc length `s` (wraps around the loop).
func point_at(s: float) -> Vector2:
	var l := length
	var sm := fmod(fmod(s, l) + l, l)
	for i in range(center.size() - 1):
		if cum[i + 1] >= sm:
			var seg_len: float = cum[i + 1] - cum[i]
			var t: float = 0.0 if seg_len <= 1e-6 else (sm - cum[i]) / seg_len
			return (center[i] as Vector2).lerp(center[i + 1], t)
	return center[0]

## Left + right border polylines for rendering, at a given half-width.
func borders(width: float = -1.0) -> Dictionary:
	if width < 0.0:
		width = half_width
	var left: Array = []
	var right: Array = []
	var n := center.size()
	for i in n:
		var a: Vector2 = center[i]
		var b: Vector2 = center[(i + 1) % n]
		var dir := (b - a).normalized()
		var off := Geo.perp(dir) * width
		left.append(a + off)
		right.append(a - off)
	return {"left": left, "right": right}
