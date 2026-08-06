class_name Car
extends RefCounted
## Single-car arcade physics. The car follows its Trajectory at the requested
## speed, capped by cornering grip: drawing too fast into a tight corner makes it
## slide outward and bleed speed (a time penalty, never a hard stop). Off-track
## reduces grip. Ported from src/core/CarSim.ts.
##
## NOTE: this vertical slice keeps the core feel (corner grip, slide, drift yaw,
## off-track slowdown, lap counting) but omits — for now — the per-car "stats"
## setup, off-track elimination, and the celebratory finish power-slide. Those
## come in the next milestone.

var traj: Dictionary        ## { points, speeds, curvatures, spacing, length }
var s := 0.0                ## Arc length travelled along the trajectory.
var speed := 0.0            ## Current forward speed (px/s).
var slide := 0.0            ## SIGNED lateral slide offset (px). Eases through 0,
                            ## so S-curves and drift-recovery never snap sides.
var _slide_sign := 1.0      ## Latest outward direction (±1), from the curve side.

var pos: Vector2
var dir := Vector2(0, 1)
## Pos/dir at the previous sim step — the scene lerps prev→current by the
## accumulator fraction so rendering is smooth at any display Hz (same trick
## as the web build's prevRenderPos).
var prev_render_pos: Vector2
var prev_render_dir := Vector2(0, 1)
var finished := false
var sliding := false        ## True while sliding above grip this tick (for FX).
var off_track := false

var _center_lap := 0
var _prev_center_frac := 0.0
var _crossings := 0
var _last_cross_s := 0.0
var _prev_pos: Vector2

func _init(trajectory: Dictionary, track: Track) -> void:
	traj = trajectory
	var pts: Array = traj["points"]
	pos = pts[0] if pts.size() > 0 else Vector2.ZERO
	if pts.size() >= 2:
		dir = (pts[1] - pts[0]).normalized()
	speed = GameConst.CAR_MIN_SPEED * 0.5
	_prev_pos = pos
	prev_render_pos = pos
	prev_render_dir = dir
	_prev_center_frac = float(track.project(pos)["s"]) / track.length

## Sample trajectory position / target-speed / curvature / tangent at arc length `at_s`.
func _sample_at(at_s: float) -> Dictionary:
	var pts: Array = traj["points"]
	var speeds: Array = traj["speeds"]
	var curvs: Array = traj["curvatures"]
	var spacing: float = traj["spacing"]
	var f_idx := at_s / spacing
	var i := int(clampf(floor(f_idx), 0.0, float(pts.size() - 2)))
	var frac := clampf(f_idx - float(i), 0.0, 1.0)
	var a: Vector2 = pts[i]
	var b: Vector2 = pts[i + 1] if i + 1 < pts.size() else a
	var p := a + (b - a) * frac
	var target: float = speeds[i] + (speeds[i + 1] - speeds[i]) * frac
	var curv: float = curvs[i] + (curvs[i + 1] - curvs[i]) * frac
	var tangent := (b - a).normalized()
	return {"p": p, "target": target, "curv": curv, "tangent": tangent}

## Advance one fixed timestep.
func update(dt: float, track: Track) -> void:
	prev_render_pos = pos
	prev_render_dir = dir
	if finished or traj["points"].size() < 2:
		return
	var sample := _sample_at(s)
	var p: Vector2 = sample["p"]
	var target: float = sample["target"]
	var curv: float = sample["curv"]
	var tangent: Vector2 = sample["tangent"]

	# --- Corner grip limit: vmax = sqrt(latAccel / |curvature|) ---
	var curv_abs := absf(curv)
	var corner_max := sqrt(GameConst.CAR_MAX_LAT_ACCEL / maxf(curv_abs, 1e-5))

	# Off-track test uses the clean PATH point (not the slide-distorted render pos).
	off_track = float(track.project(p)["dist"]) > track.half_width

	# Effective target: on track capped by corner grip; off track capped to a crawl.
	var eff_target := minf(target, GameConst.CAR_OFF_TRACK_MAX_SPEED) if off_track else minf(target, corner_max)

	# Drift only when BOTH the steering is sharp AND the speed is well over the limit.
	var corner_factor := clampf(
		(curv_abs - GameConst.CAR_CORNER_SLIDE_MIN) / (GameConst.CAR_CORNER_SLIDE_FULL - GameConst.CAR_CORNER_SLIDE_MIN),
		0.0, 1.0
	)
	var excess := maxf(0.0, target - corner_max)
	var over_margin := GameConst.CAR_DRIFT_SPEED_MARGIN + corner_max * 0.06
	var corner_gate := clampf((corner_factor - GameConst.CAR_DRIFT_CORNER_MIN) / (1.0 - GameConst.CAR_DRIFT_CORNER_MIN), 0.0, 1.0)
	var over_gate := clampf((excess - over_margin) / over_margin, 0.0, 1.0)
	var drift := 0.0 if off_track else corner_gate * over_gate
	sliding = drift > 0.12
	# Outward direction = opposite the turn side; updated only in real corners.
	if curv_abs > 1e-4:
		_slide_sign = -signf(curv)
	# SIGNED target: the sign rides along, so when the corner flips (S-curve) or
	# ends, the slide eases THROUGH zero instead of jumping to the other side.
	var slide_target := minf(GameConst.CAR_MAX_SLIDE, excess * GameConst.CAR_SLIDE_GAIN) * drift * _slide_sign
	# Build up gradually (ease), return to the line gently (recover).
	var rate := GameConst.CAR_SLIDE_EASE if absf(slide_target) > absf(slide) else GameConst.CAR_SLIDE_RECOVER
	slide += (slide_target - slide) * minf(1.0, rate * dt)

	# Accelerate / brake toward the effective target.
	if speed < eff_target:
		speed = minf(eff_target, speed + GameConst.CAR_ACCEL * dt)
	else:
		var brake := GameConst.CAR_OFF_TRACK_BRAKE if off_track else GameConst.CAR_BRAKE * (1.9 if sliding else 1.0)
		speed = maxf(eff_target, speed - brake * dt)
	speed = maxf(GameConst.CAR_OFF_TRACK_MIN_SPEED if off_track else GameConst.CAR_MIN_SPEED, speed)

	# Advance along the trajectory.
	s += speed * dt

	# Lateral offset: perp(tangent) scaled by the SIGNED slide.
	var wanted := p + Geo.perp(tangent) * slide
	# Low-pass the rendered position so residual noise can't snap the car.
	pos = pos + (wanted - pos) * GameConst.CAR_RENDER_SMOOTH

	# Drift yaw: rotate the heading off the tangent while sliding (visible drift).
	var drift_angle := (slide / GameConst.CAR_MAX_SLIDE) * GameConst.CAR_DRIFT_MAX_ANGLE
	dir = tangent.rotated(drift_angle)

	_update_progress(track)

	# Authoritative finish: the LAPS-th FORWARD crossing of the start line.
	if Geo.segments_intersect(_prev_pos, pos, track.start_a, track.start_b):
		var fwd := (pos - _prev_pos).dot(track.start_dir)
		if fwd > 0.0 and s - _last_cross_s > track.length * 0.4:
			_crossings += 1
			_last_cross_s = s
	_prev_pos = pos

	if _crossings >= GameConst.LAPS or s >= float(traj["length"]):
		finished = true
		speed = 0.0

func _update_progress(track: Track) -> void:
	var frac := float(track.project(pos)["s"]) / track.length
	if _prev_center_frac > 0.7 and frac < 0.3:
		_center_lap += 1
	elif _prev_center_frac < 0.3 and frac > 0.7:
		_center_lap = maxi(0, _center_lap - 1)
	_prev_center_frac = frac

## 1-based lap for the HUD (capped at total laps).
func display_lap() -> int:
	return mini(GameConst.LAPS, _center_lap + 1)
