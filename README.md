# FLL Field Mapping Studio

FLL Field Mapping Studio is a browser-based route planner for First LEGO League teams. It lets students sketch a mission, define the robot footprint, add attachments, and replay the resulting path before they spend time tuning code on the physical mat.

## What It Does

- Build a mission with move and rotate actions
- Set the starting pose in centimeters and degrees
- Define robot width, length, and turn-center offset
- Model simple front, rear, left, and right attachments
- Replay a route directly on the field map
- Save robot profiles locally in the browser
- Share a mission through a URL payload
- Sync missions and robots through hosted team endpoints

## Project Structure

- `index.html`: main mission-planning interface
- `robot_builder.html`: robot footprint and attachment editor
- `team_signup.html`: hosted registration flow for team cloud access
- `introduction.html`: user-facing explanation of the workflow and assumptions
- `js/core.js`: shared normalization, storage, and cloud helpers
- `js/app.js`: main planner state, rendering, replay, and team sync
- `js/robot_builder.js`: robot builder interactions
- `js/signup.js`: team signup flow
- `field.svg`: field artwork loaded by the mission planner
- `styles.css`: shared UI styling

## How To Run

No build step is required.

1. Open the repo with any static file server.
2. Serve the site root.
3. Open `index.html`.

Examples:

```bash
python3 -m http.server 8000
```

Then browse to `http://localhost:8000/`.

## Mission Model

Each mission is a single JSON object with:

- `name`
- `startX`
- `startY`
- `startAngle`
- `robotWidthCm`
- `robotLengthCm`
- `traceColor`
- `offsetY`
- `attachments`
- `actions`

Example:

```json
{
  "name": "Coral Sweep",
  "startX": 11.5,
  "startY": 0,
  "startAngle": 90,
  "robotWidthCm": 17,
  "robotLengthCm": 15,
  "traceColor": "#108368",
  "offsetY": 1.8,
  "attachments": [
    { "side": "front", "widthCm": 6, "lengthCm": 4, "positionCm": 0 }
  ],
  "actions": [
    { "type": "move", "value": 17 },
    { "type": "rotate", "value": -24 },
    { "type": "move", "value": 50 },
    { "type": "move", "value": -50 },
    { "type": "rotate", "value": 24 },
    { "type": "move", "value": -17 }
  ]
}
```

## Modeling Assumptions

- Motion is a planning aid, not a physics simulation.
- Rotations are treated as in-place turns around a configurable center offset.
- Coordinates use centimeters, with `(0,0)` at the lower-left of the field.
- `0` degrees points along positive X and positive angles rotate counter-clockwise.
- The robot body is modeled as a rectangle with optional rectangular attachments.
- Accurate real-world results still depend on calibration, sensor usage, traction, and field setup.

## Notes On Team Cloud

The cloud features depend on hosted Supabase edge functions and are intended for the deployed site. Local development can still use the full local-planning workflow, but team sync and signup are intentionally limited when the site is running from a local origin.

## Recommended Next Work

- Improve kinematics beyond simple in-place rotation
- Add field obstacles, scoring zones, or collision checks
- Add import/export for multiple missions as a bundle
- Add lightweight automated checks for mission normalization and replay generation
