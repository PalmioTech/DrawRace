class_name SpeedProfile
## Turns a raw timestamped finger stroke into a drivable Trajectory.
## This is the heart of the draw-to-race mechanic: the SPEED of the finger while
## drawing becomes the car's target speed along the path.
## Ported from src/core/PathSmoother.ts + src/core/SpeedProfile.ts.
##
## `raw` is an Array of dictionaries: [{ "pos": Vector2, "t": int(ms) }, ...]
## Returns a Trajectory dictionary:
##   { points:Array[Vector2], speeds:Array[float], curvatures:Array[float],
##     spacing:float, length:float }

static func build(raw: Array, spacing: float) -> Dictionary:
	var positions: Array = []
	for rp in raw:
		positions.append(rp["pos"])
	var points := _smooth_and_resample(positions, spacing)

	# --- 1. Finger speed sampled along the RAW (timed) stroke ---
	var raw_cum := Geo.cumulative_lengths(positions)
	var raw_speed: Array = []
	raw_speed.resize(raw.size())
	raw_speed.fill(0.0)
	for i in range(1, raw.size()):
		var dd: float = raw_cum[i] - raw_cum[i - 1]
		var dt_ms := maxf(1.0, float(raw[i]["t"]) - float(raw[i - 1]["t"]))
		raw_speed[i] = (dd / dt_ms) * 1000.0  # px/s
	if raw.size() > 1:
		raw_speed[0] = raw_speed[1]

	# Smooth the jittery finger speed with a moving average.
	var smoothed := Geo.smooth_scalars(raw_speed, GameConst.DRAW_SMOOTH_WINDOW)

	# --- 2. Map finger speed onto each resampled node by arc length ---
	var total_raw: float = raw_cum[raw_cum.size() - 1]
	if total_raw <= 0.0:
		total_raw = 1.0
	var speeds: Array = []
	speeds.resize(points.size())
	for i in points.size():
		var frac := 0.0 if points.size() <= 1 else float(i) / float(points.size() - 1)
		var target_s := frac * total_raw
		var finger_speed := _sample_at_arc(raw_cum, smoothed, target_s)
		speeds[i] = clampf(
			finger_speed * GameConst.DRAW_SPEED_GAIN,
			GameConst.CAR_MIN_SPEED,
			GameConst.CAR_MAX_SPEED
		)

	var curvatures := Geo.smooth_scalars(
		Geo.compute_curvatures(points, spacing),
		GameConst.SMOOTH_CURVATURE_WINDOW
	)
	return {
		"points": points,
		"speeds": Geo.smooth_scalars(speeds, 2),
		"curvatures": curvatures,
		"spacing": spacing,
		"length": float(points.size() - 1) * spacing,
	}

## Smooth a raw stroke into an evenly spaced, fluid polyline (Catmull-Rom + resample).
static func _smooth_and_resample(raw: Array, spacing: float) -> Array:
	if raw.size() < 2:
		return raw.duplicate()
	# Light pre-decimation so the spline isn't fed thousands of near-duplicate samples.
	var decimated: Array = [raw[0]]
	for i in range(1, raw.size()):
		var last: Vector2 = decimated[decimated.size() - 1]
		if raw[i].distance_to(last) >= spacing * 0.6:
			decimated.append(raw[i])
	if decimated[decimated.size() - 1] != raw[raw.size() - 1]:
		decimated.append(raw[raw.size() - 1])
	var dense := Geo.sample_open_spline(decimated, 12)
	var even := Geo.resample_by_arc_length(dense, spacing)
	return Geo.smooth_points(even, GameConst.SMOOTH_PATH_WINDOW)

## Sample `values` (aligned to cumulative arc lengths `cum`) at arc length `s`.
static func _sample_at_arc(cum: Array, values: Array, s: float) -> float:
	if values.is_empty():
		return 0.0
	if s <= 0.0:
		return values[0]
	if s >= float(cum[cum.size() - 1]):
		return values[values.size() - 1]
	for i in range(1, cum.size()):
		if cum[i] >= s:
			var seg_len: float = cum[i] - cum[i - 1]
			var t: float = 0.0 if seg_len <= 1e-6 else (s - cum[i - 1]) / seg_len
			return values[i - 1] + (values[i] - values[i - 1]) * t
	return values[values.size() - 1]
