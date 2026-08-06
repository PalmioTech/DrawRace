class_name AIDriver
## Generates an AI trajectory: follows the track's ideal line (centerline with a
## mild racing-line apex bias) for all laps, choosing target speeds from the SAME
## cornering-grip physics the player is bound by — then injects occasional
## mistakes. The result is a plain Trajectory dictionary run by the exact same
## Car sim as a human's. Ported from src/core/AIDriver.ts.

## Difficulty parameters:
##  aggression = fraction of the grip-limited corner speed the AI dares (≤1 safe)
##  error_rate = probability per node of an error (overcooking a corner)
##  error_mag  = how badly an error overshoots the safe speed
const PARAMS := {
	"easy":   {"aggression": 0.66, "error_rate": 0.1,   "error_mag": 1.3},
	"normal": {"aggression": 0.8,  "error_rate": 0.05,  "error_mag": 1.4},
	"hard":   {"aggression": 0.9,  "error_rate": 0.022, "error_mag": 1.5},
}

## Build an AI trajectory covering GameConst.LAPS laps.
## `seed` varies the line + mistakes per car, deterministically.
static func build(track: Track, difficulty: String, rng_seed: int) -> Dictionary:
	var p: Dictionary = PARAMS[difficulty]
	var aggression: float = p["aggression"]
	var error_rate: float = p["error_rate"]
	var error_mag: float = p["error_mag"]
	var rand := RandomNumberGenerator.new()
	rand.seed = rng_seed
	var spacing := GameConst.PATH_SPACING

	# Lateral apex-bias offset (px), constant per car, so lines differ slightly.
	var apex_bias := (rand.randf() * 2.0 - 1.0) * track.half_width * 0.45

	# Walk the centerline LAPS times, sampling evenly by arc length.
	var points: Array = []
	var total := track.length * float(GameConst.LAPS)
	var s := 0.0
	while s < total:
		var base := track.point_at(s)
		var tan := track.tangent_at(s)
		points.append(base + Geo.perp(tan) * apex_bias)
		s += spacing

	var curvatures := Geo.smooth_scalars(
		Geo.compute_curvatures(points, spacing),
		GameConst.SMOOTH_CURVATURE_WINDOW
	)

	# Target speeds from the corner-grip limit, scaled by aggression, with
	# occasional deliberate overshoots (mistakes) that will make it slide.
	var speeds: Array = []
	speeds.resize(points.size())
	for i in points.size():
		var curv := maxf(absf(curvatures[i]), 1e-5)
		var corner_max := sqrt(GameConst.CAR_MAX_LAT_ACCEL / curv)
		var target := minf(GameConst.CAR_MAX_SPEED, corner_max) * aggression
		if rand.randf() < error_rate:
			target = minf(GameConst.CAR_MAX_SPEED, corner_max * error_mag)  # overcook → slide
		speeds[i] = maxf(GameConst.CAR_MIN_SPEED, target)

	return {
		"points": points,
		"speeds": speeds,
		"curvatures": curvatures,
		"spacing": spacing,
		"length": float(points.size() - 1) * spacing,
	}
