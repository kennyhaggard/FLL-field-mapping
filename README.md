# First Lego League Field Mapping

A tool to plot paths for First Lego League

Welcome! This tool is designed to help First Lego League teams plan their movement across the field.

## Overview

This is a simple script that relies on providing a JSON text file with a set of missions. The tool helps visualize and trace the robot's movement on the field based on the mission data.

### Assumptions
1. **Zero Point Turns**: The robot's turns are centered at its midpoint. This may not always be accurate as wheelbases are typically offset.
2. **Movement Timing**: Timing is not representative of the robot's actual speed; it only reflects the robot's path.
3. **Accurate Turns**: The robot must turn accurately for the tool to be effective. This is best achieved by using the hub's yaw sensor. Implementation can be done in Python or block code.
4. **Coordinate System**: (0,0) is the lower left corner of the robot when it is oriented at 90 degrees (pointedup). You might have to experiment with placements to get the hang of how I have it programed.
5. **Measurements** All measurements are in centimeters and degrees. In general, the coordinates follow the 0 degrees is in the positive x-axis and positive angles are counter-clockwise.

## Mission Format

The tool requires missions to be provided in a specific JSON format. Below is an example, also in the repository there is a missions.json file with this code:

```json
[
    {
        "name": "Mission 1",
        "startX": 0,
        "startY": 0,
        "startAngle": 90,
        "robotWidthCm": 30,
        "robotHeightCm": 13,
        "traceColor": "green",
        "actions": [
            { "type": "move", "value": 17 },
            { "type": "rotate", "value": -24 },
            { "type": "move", "value": 30 },
            { "type": "move", "value": -30 },
            { "type": "rotate", "value": 24 },
            { "type": "move", "value": -17 }
        ]
    },
    {
        "name": "Mission 2",
        "startX": 0,
        "startY": 30,
        "startAngle": 0,
        "robotWidthCm": 30,
        "robotHeightCm": 12,
        "traceColor": "red",
        "actions": [
            { "type": "move", "value": 50 },
            { "type": "rotate", "value": 90 },
            { "type": "move", "value": 10 }
        ]
    },
    {
        "name": "Mission 3",
        "startX": 150,
        "startY": 30,
        "startAngle": 180,
        "robotWidthCm": 10,
        "robotHeightCm": 12,
        "traceColor": "yellow",
        "actions": [
            { "type": "move", "value": 50 },
            { "type": "rotate", "value": -90 },
            { "type": "move", "value": 10 }
        ]
    },
    {
        "name": "Mission 4",
        "startX": 150,
        "startY": 30,
        "startAngle": 180,
        "robotWidthCm": 10,
        "robotHeightCm": 12,
        "traceColor": "blue",
        "actions": [
            { "type": "move", "value": 50 },
            { "type": "rotate", "value": -90 },
            { "type": "move", "value": 10 }
        ]
    },
    {
        "name": "Mission 5",
        "startX": 150,
        "startY": 30,
        "startAngle": 180,
        "robotWidthCm": 10,
        "robotHeightCm": 12,
        "traceColor": "purple",
        "actions": [
            { "type": "move", "value": 50 },
            { "type": "rotate", "value": -90 },
            { "type": "move", "value": 10 }
        ]
    }
]
```
