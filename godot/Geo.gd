class_name Geo
## Pure geometry: Catmull-Rom splines, arc-length resampling, polyline projection,
## curvature. Ported 1:1 from src/core/Geometry.ts. Uses Godot's built-in Vector2
## (so add/sub/scale/length/normalized/lerp come for free).

## Left-hand perpendicular (rotate +90°).
static func perp(a: Vector2) -> Vector2:
	return Vector2(-a.y, a.x)

## Catmull-Rom interpolation between p1 and p2 (p0, p3 are neighbours).
static func catmull_rom(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t: float) -> Vector2:
	var t2 := t * t
	var t3 := t2 * t
	return 0.5 * (
		(2.0 * p1)
		+ (-p0 + p2) * t
		+ (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
		+ (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
	)

## Sample a CLOSED Catmull-Rom loop through `controls` → dense polyline (track centerline).
static func sample_closed_spline(controls: Array, samples_per_seg: int = 16) -> Array:
	var n := controls.size()
	var out: Array = []
	for i in n:
		var p0: Vector2 = controls[(i - 1 + n) % n]
		var p1: Vector2 = controls[i]
		var p2: Vector2 = controls[(i + 1) % n]
		var p3: Vector2 = controls[(i + 2) % n]
		for s in samples_per_seg:
			out.append(catmull_rom(p0, p1, p2, p3, float(s) / float(samples_per_seg)))
	return out

## Sample an OPEN Catmull-Rom spline through `points` (endpoints duplicated) → dense polyline.
static func sample_open_spline(points: Array, samples_per_seg: int = 12) -> Array:
	if points.size() < 2:
		return points.duplicate()
	var out: Array = []
	var n := points.size()
	for i in range(n - 1):
		var p0: Vector2 = points[max(0, i - 1)]
		var p1: Vector2 = points[i]
		var p2: Vector2 = points[i + 1]
		var p3: Vector2 = points[min(n - 1, i + 2)]
		for s in samples_per_seg:
			out.append(catmull_rom(p0, p1, p2, p3, float(s) / float(samples_per_seg)))
	out.append(points[n - 1])
	return out

## Cumulative arc length along a polyline (length == points.size()).
static func cumulative_lengths(points: Array) -> Array:
	var cum: Array = [0.0]
	for i in range(1, points.size()):
		cum.append(cum[i - 1] + points[i - 1].distance_to(points[i]))
	return cum

## Resample a dense polyline into evenly spaced points `spacing` px apart.
static func resample_by_arc_length(dense: Array, spacing: float) -> Array:
	if dense.is_empty():
		return []
	var out: Array = [dense[0]]
	var prev: Vector2 = dense[0]
	var acc := 0.0
	for i in range(1, dense.size()):
		var seg_start: Vector2 = prev
		var seg_end: Vector2 = dense[i]
		var seg_len := seg_start.distance_to(seg_end)
		while acc + seg_len >= spacing:
			var remain := spacing - acc
			var t := remain / seg_len
			var node := seg_start.lerp(seg_end, t)
			out.append(node)
			seg_start = node
			seg_len = seg_start.distance_to(seg_end)
			acc = 0.0
		acc += seg_len
		prev = seg_end
	return out

## SIGNED discrete curvature at each point (+ left / - right; magnitude ~= 1/radius).
static func compute_curvatures(points: Array, spacing: float) -> Array:
	var n := points.size()
	var curv: Array = []
	curv.resize(n)
	curv.fill(0.0)
	for i in range(1, n - 1):
		var a: Vector2 = points[i] - points[i - 1]
		var b: Vector2 = points[i + 1] - points[i]
		if a.length() < 1e-4 or b.length() < 1e-4:
			continue
		var cross := a.x * b.y - a.y * b.x
		var d := a.x * b.x + a.y * b.y
		var angle := atan2(cross, d)
		curv[i] = angle / spacing
	if n > 1:
		curv[0] = curv[1]
		curv[n - 1] = curv[n - 2]
	return curv

## Moving-average smoothing of a scalar array over a ±w window.
static func smooth_scalars(values: Array, w: int) -> Array:
	if w <= 0:
		return values.duplicate()
	var out: Array = []
	out.resize(values.size())
	for i in values.size():
		var sum := 0.0
		var count := 0
		for k in range(-w, w + 1):
			var j := i + k
			if j >= 0 and j < values.size():
				sum += values[j]
				count += 1
		out[i] = sum / count
	return out

## Moving-average smoothing of a polyline's positions (endpoints kept fixed).
static func smooth_points(points: Array, w: int) -> Array:
	if w <= 0 or points.size() < 3:
		return points.duplicate()
	var out: Array = points.duplicate()
	for i in range(1, points.size() - 1):
		var s := Vector2.ZERO
		var count := 0
		for k in range(-w, w + 1):
			var j := i + k
			if j >= 0 and j < points.size():
				s += points[j]
				count += 1
		out[i] = s / count
	return out

## Project a point onto a polyline. Returns { dist, s, index }.
static func project_to_polyline(p: Vector2, poly: Array, cum: Array) -> Dictionary:
	var best := {"dist": INF, "s": 0.0, "index": 0}
	for i in range(poly.size() - 1):
		var a: Vector2 = poly[i]
		var b: Vector2 = poly[i + 1]
		var ab := b - a
		var seg_len2 := ab.x * ab.x + ab.y * ab.y
		var t := 0.0
		if seg_len2 > 1e-6:
			t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / seg_len2
			t = clamp(t, 0.0, 1.0)
		var proj := a + ab * t
		var dd := p.distance_to(proj)
		if dd < best["dist"]:
			best = {"dist": dd, "s": cum[i] + sqrt(seg_len2) * t, "index": i}
	return best

## Do segments p1-p2 and p3-p4 intersect? (start-line crossing detection).
static func segments_intersect(p1: Vector2, p2: Vector2, p3: Vector2, p4: Vector2) -> bool:
	var d1 := _cross3(p3, p4, p1)
	var d2 := _cross3(p3, p4, p2)
	var d3 := _cross3(p1, p2, p3)
	var d4 := _cross3(p1, p2, p4)
	return ((d1 > 0.0) != (d2 > 0.0)) and ((d3 > 0.0) != (d4 > 0.0))

static func _cross3(a: Vector2, b: Vector2, c: Vector2) -> float:
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
