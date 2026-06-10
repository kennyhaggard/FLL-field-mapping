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
    objective: "Headings: 0 right, 90 up, 180 left, 270 down.",
    preview: "field",
    starterMission: mission({ name: "Orientation Practice", startX: 30, startY: 24, startAngle: 90 }),
    controls: [
      { type: "missionNumber", key: "startAngle", label: "Heading", unit: "degrees", step: 1 },
      { type: "preset", label: "Heading presets", key: "startAngle", values: [0, 90, 180, 270], unit: "degrees" }
    ],
    steps: [
      "Set heading to 90 degrees.",
      "Try 0, 180, and 270.",
      "Only direction changes."
    ],
    tryIt: [
      "Point right.",
      "Point left."
    ]
  },
  {
    id: "movement",
    title: "Movement Blocks",
    shortTitle: "Movement",
    objective: "Move along the robot heading.",
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
      "Start at 45 cm.",
      "Drag the replay slider.",
      "Use a negative number to back up."
    ],
    tryIt: [
      "Move 30 cm.",
      "Set heading to 0 degrees."
    ]
  },
  {
    id: "rotation",
    title: "Rotation Blocks",
    shortTitle: "Rotations",
    objective: "Turn around the robot turn center.",
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
      "Start at -90 degrees.",
      "Drag the replay slider.",
      "Try 90 degrees."
    ],
    tryIt: [
      "Turn to 180 degrees.",
      "Turn to 0 degrees."
    ]
  },
  {
    id: "pause",
    title: "Pause Blocks",
    shortTitle: "Pause",
    objective: "Pause while the robot works in place.",
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
      "Replay the route.",
      "Find the purple pause outline.",
      "Increase pause time."
    ],
    tryIt: [
      "Pause 5 seconds.",
      "Move the pause location."
    ]
  },
  {
    id: "placement",
    title: "Robot Placement: X, Y, And Orientation",
    shortTitle: "Placement",
    objective: "Set X, Y, and orientation.",
    preview: "field",
    starterMission: mission({ name: "Placement Practice", startX: 20, startY: 20, startAngle: 90 }),
    controls: [
      { type: "missionNumber", key: "startX", label: "Start X", unit: "cm", step: 1 },
      { type: "missionNumber", key: "startY", label: "Start Y", unit: "cm", step: 1 },
      { type: "missionNumber", key: "startAngle", label: "Orientation", unit: "degrees", step: 1 }
    ],
    steps: [
      "Change Start X.",
      "Change Start Y.",
      "Change Orientation."
    ],
    tryIt: [
      "Place lower-left, point up.",
      "Place center, point right."
    ]
  },
  {
    id: "robot-base",
    title: "Robot Builder: Base Robot",
    shortTitle: "Base Robot",
    objective: "Size the base robot.",
    preview: "robot",
    starterRobot: { ...baseRobot, name: "Base Bot", robotWidthCm: 14, robotLengthCm: 18 },
    controls: [
      { type: "robotText", key: "name", label: "Robot name" },
      { type: "robotNumber", key: "robotWidthCm", label: "Width", unit: "cm", step: 0.5 },
      { type: "robotNumber", key: "robotLengthCm", label: "Length", unit: "cm", step: 0.5 }
    ],
    steps: [
      "Enter width.",
      "Enter length.",
      "Watch the base resize."
    ],
    tryIt: [
      "Make it short and wide.",
      "Make it long and narrow."
    ]
  },
  {
    id: "offset",
    title: "Turn-Center Offset",
    shortTitle: "Offset",
    objective: "Compare turn-center offsets.",
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
      "Start at 0 cm.",
      "Try 4 cm and 8 cm.",
      "Offset is center to turn point."
    ],
    tryIt: [
      "Make the front swing wider.",
      "Return to 0 cm."
    ]
  },
  {
    id: "attachments",
    title: "Attachment Builder",
    shortTitle: "Attachments",
    objective: "Add an attachment to the footprint.",
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
      "Start on the front.",
      "Change width and length.",
      "Slide the side position.",
      "Check the field footprint."
    ],
    tryIt: [
      "Move it left.",
      "Make it wider."
    ]
  }
];

function getLesson(id) {
  return lessons.find((lesson) => lesson.id === id) || null;
}

export { getLesson, lessons };
