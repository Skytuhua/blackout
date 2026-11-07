# Blackout visual system

The supplied master plan section 9 is the visual authority. This is an implementation of its approved world; no replacement visual direction is requested.

## Palette
Navy #07111B, panel #102332, text #DCEAF2, muted #92A8B7, cyan #45D5E8, purple #CA70EA, amber #F4B860, danger #F06B79. Restrict world artwork to 24–32 colors. Functional colors always carry text or shape.

## Typography
Locally vendored Barlow Condensed headings and IBM Plex Sans body text. Use tabular numbers for telemetry. Dense explanations remain DOM text, never tiny bitmap text.

## Composition
Operational surface: compact command bar, top service/observed temperature/power/time strip, dominant overhead facility map, right evidence/action inspector, bottom crew assignments. Collapse inspector under the map on small displays. Selection, dispatch, radio, and debrief retain the same hierarchy.

## World
320×192 logical pixels, 16×16 tiles, nearest-neighbor integer scaling. Flat orthogonal silhouettes, no isometric perspective, gradient illustration, smoke or sparks. Animation follows observed state and simulation time. Native and 3× asset inspection are required before accepting art.

## Interaction
One main action per task. Show observation age, unknown state, eligibility, travel and work durations before dispatch. Visible keyboard focus, 44px control targets, paused/loading/error/disabled states, reduced motion.
