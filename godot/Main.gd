extends Node2D
## Vertical slice for the Godot port of DrawRace.
##
## Flow:  draw with the mouse (= finger) starting near the start line, tracing 3
## laps → release → press SPACE to watch the car replay your line → R to reset.
##
## Rendering upgrades vs the first cut:
##  - the car is interpolated between fixed sim steps (prev→current by the
##    accumulator fraction) → smooth motion at any display Hz
##  - the asphalt is a FILLED POLYGON between the two borders (no more miter
##    spikes from a fat polyline)
##  - neon borders (soft glow pass + crisp line), checkered start line,
##    rotated car body with a slide trail

var track: Track
var drawing := false
var raw_points: Array = []          # [{ "pos": Vector2, "t": int(ms) }]
var trajectory: Dictionary = {}
var cars: Array = []                 # all racers (player + AI); empty = not racing
var race_time := 0.0
var accumulator := 0.0

# Precomputed track render data (built once in _ready).
var _outer: PackedVector2Array      # outer track outline (round joins)
var _inner: PackedVector2Array      # inner track outline (the "hole")
var _outer_line: PackedVector2Array # closed polylines for the borders
var _inner_line: PackedVector2Array
var _start_quad: Array = []          # checkered start-line squares

# Slide trail: recent positions while the car is drifting.
var _trail: Array = []               # [{ "pos": Vector2, "life": float }]

# --- lap counting during the draw (ported from PathRecorder.ts) ---
var recorder_laps := 0
var _total_len := 0.0
var _last_lap_at := 0.0
var _complete := false

func _ready() -> void:
	# "Neon Loop" control points from src/data/tracks.ts.
	var controls := [
		Vector2(640, 130), Vector2(900, 155), Vector2(1090, 290), Vector2(990, 430),
		Vector2(1110, 580), Vector2(820, 605), Vector2(640, 555), Vector2(460, 605),
		Vector2(175, 585), Vector2(285, 430), Vector2(185, 290), Vector2(375, 155),
	]
	track = Track.new(controls, 58.0)
	_build_track_render()
	queue_redraw()

## Precompute the track outlines (offset with ROUND joins → no spikes, ever)
## and the checkered start line.
func _build_track_render() -> void:
	# Closed centerline polygon (drop the duplicated last point).
	var center_poly := PackedVector2Array(track.center.slice(0, track.center.size() - 1))
	_outer = _largest_poly(Geometry2D.offset_polygon(center_poly, track.half_width, Geometry2D.JOIN_ROUND))
	_inner = _largest_poly(Geometry2D.offset_polygon(center_poly, -track.half_width, Geometry2D.JOIN_ROUND))
	# Winding can flip which delta grows the polygon: make sure _outer is the big one.
	if _poly_area(_inner) > _poly_area(_outer):
		var tmp := _outer
		_outer = _inner
		_inner = tmp
	_outer_line = _closed(_outer)
	_inner_line = _closed(_inner)
	# Checkered start line: 2 rows of small squares across the track width.
	_start_quad.clear()
	var across := (track.start_b - track.start_a)
	var n_sq := 8
	var step := across / float(n_sq)
	var fwd := track.start_dir * 7.0
	for row in 2:
		for i in n_sq:
			if (i + row) % 2 == 0:
				var a := track.start_a + step * float(i) + fwd * float(row)
				_start_quad.append(PackedVector2Array([a, a + step, a + step + fwd, a + fwd]))

## Pick the largest polygon from an offset result (it can return several).
func _largest_poly(polys: Array) -> PackedVector2Array:
	var best: PackedVector2Array = PackedVector2Array()
	var best_area := -1.0
	for p in polys:
		var area := _poly_area(p)
		if area > best_area:
			best_area = area
			best = p
	return best

## Absolute shoelace area of a polygon.
func _poly_area(p: PackedVector2Array) -> float:
	var a := 0.0
	for i in p.size():
		var j := (i + 1) % p.size()
		a += p[i].x * p[j].y - p[j].x * p[i].y
	return absf(a) * 0.5

## Closed polyline copy (first point appended at the end).
func _closed(p: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array(p)
	if p.size() > 0:
		out.append(p[0])
	return out

func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_start_draw(get_global_mouse_position())
		else:
			_end_draw()
	elif event is InputEventMouseMotion and drawing:
		_add_point(get_global_mouse_position())
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_SPACE:
			_start_race()
		elif event.keycode == KEY_R:
			_reset()

func _process(delta: float) -> void:
	if not cars.is_empty():
		accumulator += delta
		var steps := 0
		while accumulator >= GameConst.SIM_DT and steps < GameConst.MAX_STEPS_PER_FRAME:
			race_time += GameConst.SIM_DT
			for c in cars:
				c.update(GameConst.SIM_DT, track, race_time)
				if c.sliding:
					_trail.append({"pos": c.pos, "life": 1.0, "col": c.color})
			accumulator -= GameConst.SIM_DT
			steps += 1
		# Fade the slide trails.
		for t in _trail:
			t["life"] = float(t["life"]) - delta * 1.4
		_trail = _trail.filter(func(t): return float(t["life"]) > 0.0)
	queue_redraw()

# --- draw phase ------------------------------------------------------------

func _start_draw(p: Vector2) -> void:
	if not cars.is_empty():
		return
	drawing = true
	raw_points = [{"pos": p, "t": Time.get_ticks_msec()}]
	_total_len = 0.0
	_last_lap_at = 0.0
	_complete = false
	recorder_laps = 0
	trajectory = {}
	queue_redraw()

func _add_point(p: Vector2) -> void:
	if _complete:
		return
	var last: Vector2 = raw_points[raw_points.size() - 1]["pos"]
	var d := p.distance_to(last)
	if d < 2.0:
		return
	_total_len += d
	# Lap = a forward crossing of the start line, debounced by ~half a lap.
	if Geo.segments_intersect(last, p, track.start_a, track.start_b):
		var forward := (p - last).dot(track.start_dir) > 0.0
		if forward and _total_len - _last_lap_at > track.length * 0.4:
			recorder_laps += 1
			_last_lap_at = _total_len
			if recorder_laps >= GameConst.LAPS:
				_complete = true
	raw_points.append({"pos": p, "t": Time.get_ticks_msec()})
	queue_redraw()

func _end_draw() -> void:
	if not drawing:
		return
	drawing = false
	if raw_points.size() > 4 and _total_len >= GameConst.DRAW_MIN_STROKE_LENGTH:
		trajectory = SpeedProfile.build(raw_points, GameConst.PATH_SPACING)
	queue_redraw()

func _start_race() -> void:
	if trajectory.is_empty():
		return
	cars.clear()
	var player := Car.new(trajectory, track)
	player.label = "TU"
	player.color = GameConst.COL_CAR
	cars.append(player)
	var ai_traj := AIDriver.build(track, "normal", randi())
	var cpu := Car.new(ai_traj, track)
	cpu.label = "CPU"
	cpu.color = GameConst.COL_CAR_AI
	cars.append(cpu)
	_trail.clear()
	race_time = 0.0
	accumulator = 0.0
	queue_redraw()

func _reset() -> void:
	cars.clear()
	race_time = 0.0
	trajectory = {}
	raw_points = []
	_trail = []
	drawing = false
	_complete = false
	recorder_laps = 0
	_total_len = 0.0
	queue_redraw()

# --- rendering -------------------------------------------------------------

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, GameConst.DESIGN), GameConst.COL_BG)
	if track == null:
		return

	# Asphalt: fill the outer outline, then "cut" the infield with the bg color.
	draw_colored_polygon(_outer, GameConst.COL_TRACK_FILL)
	draw_colored_polygon(_inner, GameConst.COL_BG)

	# Neon borders: a soft wide glow pass underneath + a crisp bright line on top.
	var glow := GameConst.COL_TRACK_BORDER
	glow.a = 0.22
	draw_polyline(_outer_line, glow, 9.0, true)
	draw_polyline(_inner_line, glow, 9.0, true)
	draw_polyline(_outer_line, GameConst.COL_TRACK_BORDER, 2.5, true)
	draw_polyline(_inner_line, GameConst.COL_TRACK_BORDER, 2.5, true)

	# Checkered start line.
	for q in _start_quad:
		draw_colored_polygon(q, GameConst.COL_START)

	# The drawn line (before the race) / the cars (during the race).
	if cars.is_empty():
		if not trajectory.is_empty():
			_draw_trajectory()
		elif raw_points.size() >= 2:
			_draw_raw()
	else:
		_draw_trail()
		for c in cars:
			_draw_car(c)

	_draw_hud()

func _draw_trajectory() -> void:
	var pts: Array = trajectory["points"]
	var speeds: Array = trajectory["speeds"]
	var min_s := GameConst.CAR_MIN_SPEED
	var max_s := GameConst.CAR_MAX_SPEED
	for i in range(pts.size() - 1):
		var t := clampf((speeds[i] - min_s) / maxf(1.0, max_s - min_s), 0.0, 1.0)
		var col := GameConst.COL_DRAW_SLOW.lerp(GameConst.COL_DRAW_FAST, t)
		draw_line(pts[i], pts[i + 1], col, 4.0, true)

func _draw_raw() -> void:
	for i in range(raw_points.size() - 1):
		draw_line(raw_points[i]["pos"], raw_points[i + 1]["pos"], GameConst.COL_DRAW_FAST, 3.0, true)

func _draw_trail() -> void:
	for t in _trail:
		var life := float(t["life"])
		var col: Color = t["col"]
		col.a = 0.28 * life
		draw_circle(t["pos"], 3.5 * life + 1.0, col)

func _draw_car(c: Car) -> void:
	# Interpolate prev→current by the accumulator fraction → smooth at any Hz.
	var alpha := clampf(accumulator / GameConst.SIM_DT, 0.0, 1.0)
	var p := c.prev_render_pos.lerp(c.pos, alpha)
	var d := c.prev_render_dir.lerp(c.dir, alpha).normalized()
	var ang := d.angle()
	var L := GameConst.CAR_RADIUS * 2.4   # body length
	var W := GameConst.CAR_RADIUS * 1.4   # body width

	draw_set_transform(p, ang, Vector2.ONE)
	# Soft shadow under the body.
	draw_rect(Rect2(-L * 0.5 + 2.0, -W * 0.5 + 2.0, L, W), Color(0, 0, 0, 0.35))
	# Body.
	draw_rect(Rect2(-L * 0.5, -W * 0.5, L, W), c.color)
	# Nose wedge + cockpit to show the heading.
	draw_colored_polygon(PackedVector2Array([
		Vector2(L * 0.5, -W * 0.5), Vector2(L * 0.5 + 8.0, 0.0), Vector2(L * 0.5, W * 0.5)
	]), c.color)
	draw_rect(Rect2(-L * 0.1, -W * 0.28, L * 0.34, W * 0.56), Color(0.08, 0.09, 0.14))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_hud() -> void:
	var font := ThemeDB.fallback_font
	if cars.is_empty():
		var top_txt := "Giri disegnati: %d/%d" % [recorder_laps, GameConst.LAPS]
		draw_string(font, Vector2(16, 30), top_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, GameConst.COL_START)
	else:
		var ranked := _ranking()
		var player: Car = cars[0]
		var pos_idx := ranked.find(player) + 1
		var head := "Giro %d/%d — P%d — %s" % [player.display_lap(), GameConst.LAPS, pos_idx, _fmt_time(race_time)]
		draw_string(font, Vector2(16, 30), head, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, GameConst.COL_START)
		# Mini standings, one row per car.
		var y := 56.0
		for i in ranked.size():
			var c: Car = ranked[i]
			var row := "P%d  %s" % [i + 1, c.label]
			if c.finished:
				row += "  %s" % _fmt_time(c.finish_time)
			draw_string(font, Vector2(16, y), row, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, c.color)
			y += 22.0
		if _all_finished():
			var win: Car = ranked[0]
			var msg := "HAI VINTO!" if win == player else "Ha vinto il COMPUTER"
			draw_string(font, Vector2(GameConst.DESIGN.x * 0.5 - 120.0, GameConst.DESIGN.y * 0.5), msg, HORIZONTAL_ALIGNMENT_LEFT, -1, 34, win.color)
	var hint := "Disegna col mouse dalla linea di start (3 giri)  •  SPAZIO per correre  •  R per ricominciare"
	draw_string(font, Vector2(16, GameConst.DESIGN.y - 16), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, GameConst.COL_TEXT_DIM)

## Live ranking: finishers first (by time), then by progress along the track.
func _ranking() -> Array:
	var sorted := cars.duplicate()
	sorted.sort_custom(func(a: Car, b: Car) -> bool:
		if a.finished and b.finished:
			return a.finish_time < b.finish_time
		if a.finished:
			return true
		if b.finished:
			return false
		return a.race_progress(track) > b.race_progress(track)
	)
	return sorted

func _all_finished() -> bool:
	for c in cars:
		if not c.finished:
			return false
	return true

func _fmt_time(t: float) -> String:
	var m := int(t) / 60
	var s := fmod(t, 60.0)
	return "%d:%05.2f" % [m, s]
