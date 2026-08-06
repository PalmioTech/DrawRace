extends Node2D
## Vertical slice for the Godot port of DrawRace.
##
## Flow:  draw with the mouse (= finger) starting near the start line, tracing 3
## laps → release → press SPACE to watch the car replay your line → R to reset.
##
## The drawn line is coloured by finger speed (dark = slow, blue = fast). This
## scene only does rendering + input; all the game logic lives in the ported
## GameConst / Geo / Track / SpeedProfile / Car classes.

var track: Track
var drawing := false
var raw_points: Array = []          # [{ "pos": Vector2, "t": int(ms) }]
var trajectory: Dictionary = {}
var car: Car = null
var accumulator := 0.0

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
	queue_redraw()

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
	if car == null or car.finished:
		return
	accumulator += delta
	var steps := 0
	while accumulator >= GameConst.SIM_DT and steps < GameConst.MAX_STEPS_PER_FRAME:
		car.update(GameConst.SIM_DT, track)
		accumulator -= GameConst.SIM_DT
		steps += 1
		if car.finished:
			break
	queue_redraw()

# --- draw phase ------------------------------------------------------------

func _start_draw(p: Vector2) -> void:
	if car != null:
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
	car = Car.new(trajectory, track)
	accumulator = 0.0
	queue_redraw()

func _reset() -> void:
	car = null
	trajectory = {}
	raw_points = []
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

	# Track surface: a thick band along the centerline, then the neon borders.
	draw_polyline(PackedVector2Array(track.center), GameConst.COL_TRACK_FILL, track.half_width * 2.0, true)
	var b := track.borders(track.half_width)
	draw_polyline(PackedVector2Array(b["left"]), GameConst.COL_TRACK_BORDER, 3.0, true)
	draw_polyline(PackedVector2Array(b["right"]), GameConst.COL_TRACK_BORDER, 3.0, true)
	draw_line(track.start_a, track.start_b, GameConst.COL_START, 4.0)

	# The drawn line (before the race starts).
	if car == null:
		if not trajectory.is_empty():
			_draw_trajectory()
		elif raw_points.size() >= 2:
			_draw_raw()
	else:
		_draw_car()

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

func _draw_car() -> void:
	var r := GameConst.CAR_RADIUS
	draw_circle(car.pos, r, GameConst.COL_CAR)
	draw_line(car.pos, car.pos + car.dir * (r + 10.0), GameConst.COL_START, 2.0)
	if car.sliding:
		draw_arc(car.pos, r + 4.0, 0.0, TAU, 24, Color(1, 1, 1, 0.5), 1.5)

func _draw_hud() -> void:
	var font := ThemeDB.fallback_font
	var top_txt := "Giri disegnati: %d/%d" % [recorder_laps, GameConst.LAPS]
	if car != null:
		top_txt = "Giro %d/%d — %s" % [car.display_lap(), GameConst.LAPS, ("ARRIVATO" if car.finished else "in gara")]
	draw_string(font, Vector2(16, 30), top_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, GameConst.COL_START)
	var hint := "Disegna col mouse dalla linea di start (3 giri)  •  SPAZIO per correre  •  R per ricominciare"
	draw_string(font, Vector2(16, GameConst.DESIGN.y - 16), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, GameConst.COL_TEXT_DIM)
