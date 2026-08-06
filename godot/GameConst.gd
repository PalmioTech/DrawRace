class_name GameConst
## Central tuning + palette, ported from the web project's src/config/constants.ts.
## All units are DESIGN PIXELS and SECONDS (physics is resolution-independent).
## Values are exposed as individually TYPED constants (not inside a Dictionary)
## so downstream `:=` type inference stays concrete (Godot 4.7 errors on inferring
## a type from a Variant Dictionary value).

## Virtual resolution (landscape).
const DESIGN := Vector2(1280, 720)

## Laps the player must draw (baked into the trajectory).
const LAPS := 3

## Spacing (px) between resampled trajectory nodes. Smaller = smoother.
const PATH_SPACING := 7.0

## Play area the track is fitted into (small inset from the screen edges).
const PLAY_X := 6.0
const PLAY_Y := 6.0
const PLAY_W := 1280.0 - 12.0
const PLAY_H := 720.0 - 12.0

## Fixed physics timestep (60 Hz) -> deterministic feel.
const SIM_DT := 1.0 / 60.0
const MAX_STEPS_PER_FRAME := 5

## --- Car physics (design px/s, px/s^2). Same numbers as the web build. ---
const CAR_MIN_SPEED := 110.0
const CAR_MAX_SPEED := 620.0
const CAR_ACCEL := 560.0
const CAR_BRAKE := 1000.0
## Max safe corner speed = sqrt(CAR_MAX_LAT_ACCEL / curvature). Lower = slow more.
const CAR_MAX_LAT_ACCEL := 560.0
## Lateral slide (px) per px/s of over-speed in a corner.
const CAR_SLIDE_GAIN := 0.18
## Below this curvature = straight (no slide); at/above _FULL = full slide.
const CAR_CORNER_SLIDE_MIN := 0.004
const CAR_CORNER_SLIDE_FULL := 0.009
## Min over-speed before any drift, and min corner sharpness for drift.
const CAR_DRIFT_SPEED_MARGIN := 28.0
const CAR_DRIFT_CORNER_MIN := 0.2
## How fast the slide builds / recovers (per-second rate).
const CAR_SLIDE_EASE := 5.0
const CAR_SLIDE_RECOVER := 9.0
## Max lateral slide offset (px) and max drift yaw (rad).
const CAR_MAX_SLIDE := 50.0
const CAR_DRIFT_MAX_ANGLE := 0.45
## Low-pass factor for the rendered position (lower = smoother).
const CAR_RENDER_SMOOTH := 0.22
## Off-track (grass) behaviour: capped slow speed, gentler brake.
const CAR_OFF_TRACK_MAX_SPEED := 230.0
const CAR_OFF_TRACK_MIN_SPEED := 160.0
const CAR_OFF_TRACK_BRAKE := 600.0
## Visual radius of a car.
const CAR_RADIUS := 13.0

## --- Finger-speed -> car-speed mapping while drawing. ---
## car_target = clamp(finger_speed * DRAW_SPEED_GAIN, min, max)
const DRAW_SPEED_GAIN := 0.62
## Moving-average window (samples) to smooth jittery finger speed.
const DRAW_SMOOTH_WINDOW := 7
## Min drawn length (px) for a stroke to be valid.
const DRAW_MIN_STROKE_LENGTH := 400.0

## --- Extra geometry smoothing passes for the drawn line. ---
const SMOOTH_PATH_WINDOW := 4
const SMOOTH_CURVATURE_WINDOW := 8

## --- Palette (deep dark, electric blue) — from the web build's COLORS. ---
const COL_BG := Color("05070e")
const COL_TRACK_FILL := Color("0e1322")
const COL_TRACK_BORDER := Color("4d8dff")
const COL_START := Color("eef2fb")
const COL_TEXT_DIM := Color("66708c")
const COL_DRAW_SLOW := Color("3a4a6e")
const COL_DRAW_FAST := Color("4d8dff")
const COL_CAR := Color("ffe600")
