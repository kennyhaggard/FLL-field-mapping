const baseRobot = Object.freeze({
  name: "Training Bot",
  robotWidthCm: 14,
  robotLengthCm: 18,
  offsetY: 0,
  attachments: []
});

function mission(overrides = {}) {
  const robot = {
    ...baseRobot,
    ...(overrides.robot || {}),
    name: overrides.robotName || overrides.robot?.name || baseRobot.name,
    robotWidthCm: overrides.robotWidthCm ?? overrides.robot?.robotWidthCm ?? baseRobot.robotWidthCm,
    robotLengthCm: overrides.robotLengthCm ?? overrides.robot?.robotLengthCm ?? baseRobot.robotLengthCm,
    offsetY: overrides.offsetY ?? overrides.robot?.offsetY ?? baseRobot.offsetY
  };
  const attachments = overrides.attachments || robot.attachments;

  return {
    name: "Training Mission",
    ...overrides,
    robotName: robot.name,
    robot: {
      ...robot,
      attachments
    },
    startX: 20,
    startY: 20,
    startAngle: 90,
    traceColor: "#0066b3",
    robotWidthCm: robot.robotWidthCm,
    robotLengthCm: robot.robotLengthCm,
    offsetY: robot.offsetY,
    attachments,
    actions: overrides.actions || []
  };
}

const lessons = [
  {
    id: "orientation",
    title: "Field Orientation And Headings",
    shortTitle: "Orientation",
    objective: "Learn how headings point on the field: 0 degrees points right, 90 degrees points up, 180 degrees points left, and 270 degrees points down.",
    preview: "field",
    starterMission: mission({ name: "Orientation Practice", startX: 30, startY: 24, startAngle: 90 }),
    controls: [
      { type: "missionNumber", key: "startAngle", label: "Heading", unit: "degrees", step: 1 },
      { type: "preset", label: "Heading presets", key: "startAngle", values: [0, 90, 180, 270], unit: "degrees" }
    ],
    steps: [
      "Set the heading to 90 degrees and notice that the robot points toward the top of the field.",
      "Try 0, 180, and 270 degrees using the preset buttons.",
      "Watch the robot rotate in place; only its direction changes."
    ],
    tryIt: [
      "Set the robot so it points toward the right side of the field.",
      "Set the robot so it points toward the left side of the field."
    ]
  },
  {
    id: "movement",
    title: "Movement Blocks",
    shortTitle: "Movement",
    objective: "Use move blocks to drive forward or backward along the robot heading.",
    preview: "field",
    starterMission: mission({
      name: "Movement Practice",
      startX: 24,
      startY: 18,
      startAngle: 90,
      actions: [{ type: "move", value: 45 }]
    }),
    controls: [
      { type: "actionNumber", actionIndex: 0, label: "Move distance", unit: "cm", step: 1 },
      { type: "missionNumber", key: "startAngle", label: "Starting heading", unit: "degrees", step: 1 }
    ],
    steps: [
      "Start with a move of 45 cm.",
      "Drag the replay slider from start to finish to see the trace grow.",
      "Change the move distance to a negative number to practice backing up."
    ],
    tryIt: [
      "Make the robot move 30 cm forward.",
      "Change the heading to 0 degrees and replay the move."
    ]
  },
  {
    id: "rotation",
    title: "Rotation Blocks",
    shortTitle: "Rotations",
    objective: "Use rotation blocks to turn the robot around its configured turn center.",
    preview: "field",
    starterMission: mission({
      name: "Rotation Practice",
      startX: 35,
      startY: 20,
      startAngle: 90,
      actions: [{ type: "rotate", value: -90 }]
    }),
    controls: [
      { type: "actionNumber", actionIndex: 0, label: "Rotate amount", unit: "degrees", step: 1 },
      { type: "missionNumber", key: "startAngle", label: "Starting heading", unit: "degrees", step: 1 }
    ],
    steps: [
      "Start with a -90 degree rotation.",
      "Use the replay slider to see the heading change frame by frame.",
      "Change the rotation to 90 degrees and compare the turn direction."
    ],
    tryIt: [
      "Turn from 90 degrees to 180 degrees.",
      "Turn from 90 degrees to 0 degrees."
    ]
  },
  {
    id: "pause",
    title: "Pause Blocks",
    shortTitle: "Pause",
    objective: "Use pause blocks to represent time spent working on a mission model while the robot stays in place.",
    preview: "field",
    starterMission: mission({
      name: "Pause Practice",
      startX: 24,
      startY: 18,
      startAngle: 90,
      actions: [
        { type: "move", value: 35 },
        { type: "pause", value: 3 },
        { type: "move", value: 20 }
      ]
    }),
    controls: [
      { type: "actionNumber", actionIndex: 1, label: "Pause time", unit: "sec", step: 1 },
      { type: "actionNumber", actionIndex: 0, label: "First move", unit: "cm", step: 1 },
      { type: "actionNumber", actionIndex: 2, label: "Second move", unit: "cm", step: 1 }
    ],
    steps: [
      "Replay the route and look for the purple outline at the pause position.",
      "Increase the pause time and notice that the robot holds position longer.",
      "The trace continues after the pause when the next move begins."
    ],
    tryIt: [
      "Make the pause 5 seconds long.",
      "Move the pause location by changing the first move distance."
    ]
  },
  {
    id: "placement",
    title: "Robot Placement: X, Y, And Orientation",
    shortTitle: "Placement",
    objective: "Place the robot by choosing the lower-left field position and starting orientation.",
    preview: "field",
    starterMission: mission({ name: "Placement Practice", startX: 20, startY: 20, startAngle: 90 }),
    controls: [
      { type: "missionNumber", key: "startX", label: "Start X", unit: "cm", step: 1 },
      { type: "missionNumber", key: "startY", label: "Start Y", unit: "cm", step: 1 },
      { type: "missionNumber", key: "startAngle", label: "Orientation", unit: "degrees", step: 1 }
    ],
    steps: [
      "Change Start X to move the robot left or right.",
      "Change Start Y to move the robot up or down.",
      "Change Orientation to aim the robot before the first action starts."
    ],
    tryIt: [
      "Place the robot near the lower-left corner and point it upfield.",
      "Move it toward the center and point it to the right."
    ]
  },
  {
    id: "robot-base",
    title: "Robot Builder: Base Robot",
    shortTitle: "Base Robot",
    objective: "Build the base robot rectangle before adding attachments or mission actions.",
    preview: "robot",
    starterRobot: { ...baseRobot, name: "Base Bot", robotWidthCm: 14, robotLengthCm: 18 },
    controls: [
      { type: "robotText", key: "name", label: "Robot name" },
      { type: "robotNumber", key: "robotWidthCm", label: "Width", unit: "cm", step: 0.5 },
      { type: "robotNumber", key: "robotLengthCm", label: "Length", unit: "cm", step: 0.5 }
    ],
    steps: [
      "Measure the robot width from left side to right side.",
      "Measure the robot length from front to back.",
      "Enter those values and watch the base rectangle resize."
    ],
    tryIt: [
      "Make a short, wide robot.",
      "Make a long, narrow robot."
    ]
  },
  {
    id: "offset",
    title: "Turn-Center Offset",
    shortTitle: "Offset",
    objective: "See why turn-center offset matters and how changing it affects a rotation.",
    preview: "field",
    starterMission: mission({
      name: "Offset Practice",
      startX: 35,
      startY: 20,
      startAngle: 90,
      offsetY: 0,
      robot: { ...baseRobot, offsetY: 0 },
      actions: [{ type: "rotate", value: 90 }]
    }),
    controls: [
      { type: "missionNumber", key: "offsetY", label: "Offset Y", unit: "cm", step: 0.5 },
      { type: "preset", label: "Compare offsets", key: "offsetY", values: [0, 4, 8], unit: "cm" },
      { type: "actionNumber", actionIndex: 0, label: "Rotation", unit: "degrees", step: 1 }
    ],
    steps: [
      "Start with offset 0 cm and replay the turn.",
      "Try 4 cm and 8 cm. The robot body moves differently because the turn center is not in the same place.",
      "To estimate offset, measure from the robot center to the point the robot turns around."
    ],
    tryIt: [
      "Find an offset where the front of the robot swings around a wider arc.",
      "Set the offset back to 0 cm and compare."
    ]
  },
  {
    id: "attachments",
    title: "Attachment Builder",
    shortTitle: "Attachments",
    objective: "Add and position an attachment, then see how the robot footprint changes on the field.",
    preview: "robotAndField",
    starterMission: mission({
      name: "Attachment Practice",
      startX: 26,
      startY: 20,
      startAngle: 90,
      robot: {
        ...baseRobot,
        name: "Attachment Bot",
        attachments: [{ side: "front", widthCm: 6, lengthCm: 4, positionCm: 0 }]
      },
      attachments: [{ side: "front", widthCm: 6, lengthCm: 4, positionCm: 0 }],
      actions: [{ type: "move", value: 25 }]
    }),
    controls: [
      { type: "attachmentSide", index: 0, label: "Attachment side" },
      { type: "attachmentNumber", index: 0, key: "widthCm", label: "Attachment width", unit: "cm", step: 0.5 },
      { type: "attachmentNumber", index: 0, key: "lengthCm", label: "Attachment length", unit: "cm", step: 0.5 },
      { type: "attachmentNumber", index: 0, key: "positionCm", label: "Side position", unit: "cm", step: 0.5 }
    ],
    steps: [
      "Start with a front attachment.",
      "Change the width and length to match a mission tool.",
      "Change the side position to slide it along the selected side.",
      "Use the field preview to see the full footprint on the mat."
    ],
    tryIt: [
      "Move the attachment to the left side.",
      "Make the attachment wider and replay the short move."
    ]
  }
];

function getLesson(id) {
  return lessons.find((lesson) => lesson.id === id) || null;
}

export { getLesson, lessons };
