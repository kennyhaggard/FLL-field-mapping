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
- Download and import mission JSON files without a team connection
- Sync missions and robots through hosted team endpoints

## Project Structure

- `index.html`: main mission-planning interface
- `robot_builder.html`: robot footprint and attachment editor
- `training.html`: student-facing lesson hub for focused field mapping practice
- `training/`: guided lesson pages with purpose-built sandboxes
- `team_signup.html`: hosted registration flow for team cloud access
- `introduction.html`: user-facing explanation of the workflow and assumptions
- `js/domain/`: pure mission, robot, replay, storage, share, and runtime modules
- `js/ui/`: field and robot canvas renderers
- `js/app.js`: mission planner controller
- `js/robot_builder.js`: robot builder controller
- `js/signup.js`: team signup controller
- `tests/`: Node-based tests for replay math and storage migration
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

Automated checks:

```bash
npm test
```

## Mission Model

### Saving and opening missions

Missions are **not autosaved or restored from browser storage**. A fresh visit
starts a new mission. Open a shared link, import a JSON file, or connect a team
and explicitly choose **Load Mission**. Selecting a cloud entry does not load it.

The saving bar identifies a new mission, demo, shared copy, file copy, or team
mission. Edits show **Unsaved changes** until you save to the team or download
the current mission. A shared link is a snapshot, not a live cloud document.
Editing or replacing a shared copy removes its URL payload to avoid reopening
the original over the current work. Cloud saves checkpoint the version sent;
edits made while a save is in progress remain unsaved.

Use **Download Mission** / **Import Mission** for file-based work. File imports
accept mission JSON and old storage envelopes, with a 96 KB size limit and
preview limits of 500 actions and 10 simulated minutes. Invalid imports leave
the current mission unchanged. Apply or discard manual JSON edits before
saving or sharing.

The tool warns before replacing unsaved work and requests the browser's standard
leave/reload warning. Browser warnings are best-effort and do not protect against
crashes or forced termination; keep a downloaded file or team save.

Old browser drafts are neither loaded nor deleted. If present, **Download old
draft** exports a copy without changing the current mission. Display preferences,
team connection information, local robot profiles, and robot handoff still use
browser storage. Robot Builder does not autosave its in-progress edits.

### Editing and the field preview

The mission editor and field preview are separate snapshots. Editing actions,
starting pose, robot dimensions, attachments, or colors does not redraw the
field or change an existing replay. A banner identifies pending preview changes.
**Start Mission** applies and runs the current editor contents without saving.
A successful **Save to Team** or **Download Mission** also updates the preview.
Failed saves do not update it, and slow saves cannot replace a newer started
preview. Newer edits made during a save remain pending.

**Replay Field**, Play, Rewind Replay, Return Robot to Start, and the frame slider operate on the
last applied snapshot. Loading/importing a different mission or choosing New Blank Mission/Load Demo
explicitly replaces both editor and preview. Field Setup and display visibility
remain immediate controls. A robot drag adds pending steps and returns the robot
to its original position; apply pending edits before dragging again.

Undo/Redo keeps up to 100 edit checkpoints in memory only. Changes during one
field-focus session are grouped. Undo does not redraw the route or undo a saved
file/cloud write; loading or creating a mission starts a fresh history. Keyboard
shortcuts outside text fields are Ctrl/Command-Z and Ctrl/Command-Shift-Z (or
Ctrl-Y). Text fields retain their native editing shortcuts. Apply or discard raw
JSON before using mission history.

The current playback step and expandable applied-steps list describe the field
snapshot. Editor rows are highlighted only while the draft matches that snapshot.
Rewind Replay stops animation and retains replay frames; Return Robot to Start
also clears the trail without deleting steps. New Blank Mission clears the editor
after confirmation. Advanced Mission JSON starts collapsed; sharing is available
beside the field controls.

Mission validation is shared by editing, file/JSON import, shared links, cloud
replacement, and animation generation: at most 500 actions, 100 attachments,
96 KB of normalized content, and 10 minutes of default simulated movement.
Animation allocation is capped at 40,000 frames even with custom replay options.
Rejected editor changes keep the previous valid mission and show a warning.

Replay rendering indexes action boundaries and pause poses once per frame array,
reduces straight movement to endpoints, reuses corridor SVG nodes, and skips
unchanged geometry during pauses. The optional `scripts/verify_student_workflow.cjs`
check covers undo, click handling, validation, playback, highlighting, responsive
layout, and a full-versus-compacted corridor geometry benchmark. Run it with a
static server on port 8000 and Playwright installed (or `PLAYWRIGHT_MODULE` set).

### Field setup

Field Setup assigns M13 (Keystone), M14 (Seeds), and M15 (House) to Mine
(upper right), Farm (middle), and City (bottom), listed in that order. Selecting an occupied model swaps the
two docks. The summary above the field stays visible when the panel is collapsed.
The optional physical-field confirmation is local to the current page session;
changing layouts clears it. It does not prevent running a mission.

`fieldSetup: { city: "m15", farm: "m13", mine: "m14" }` travels with mission
JSON files, shared links, and team mission payloads. Older missions use
this default. Partial or duplicate assignments are repaired on import.

The six `field_*.svg` source files preserve the calibrated placements, with
filenames ordered City, Farm, Mine. After editing them in Inkscape, regenerate
the shared model-only asset and placement table with:

```bash
python3 scripts/extract_dock_models.py | apply_patch
```

Only the model asset is loaded by the app, not the six full preview SVGs.

### Mission JSON

Each mission is a single JSON object with:

- `name`
- `headingMode` (`"relative"` or `"global"`)
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
  "headingMode": "relative",
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
- Relative mode uses Cartesian angles: `0` degrees points along positive X, positive angles rotate counter-clockwise, and Rotate values are turn amounts.
- Global mode uses field headings: `0` points upfield, `90` right, `-90` left, and `180` downfield. Rotate values are absolute target headings.
- The robot body is modeled as a rectangle with optional rectangular attachments.
- Accurate real-world results still depend on calibration, sensor usage, traction, and field setup.

## Notes On Team Cloud

The cloud features depend on hosted Supabase edge functions and are intended for the deployed site. Local development can still use the full local-planning workflow, but team sync and signup are intentionally limited when the site is running from a local origin.

## Recommended Next Work

- Add field obstacles, scoring zones, or collision checks
- Add import/export for multiple missions as a bundle
- Add browser-level smoke tests for the three page flows
- Decide whether team cloud should stay as lightweight Supabase edge functions or move to a fuller API model
