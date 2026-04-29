function detectRuntimeMode(locationLike = globalThis.location) {
  const hostname = String(locationLike?.hostname || "");
  const protocol = String(locationLike?.protocol || "");
  const isLocal =
    protocol === "file:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1";

  if (isLocal) {
    return {
      kind: "local",
      allowsCloudSync: false,
      label: "Local mode",
      detail: "Cloud sync and team signup only work on the hosted site."
    };
  }

  return {
    kind: "hosted",
    allowsCloudSync: true,
    label: "Hosted mode",
    detail: "Cloud sync is available for team missions and robot profiles."
  };
}

function isHostedRuntime(locationLike = globalThis.location) {
  return detectRuntimeMode(locationLike).kind === "hosted";
}

function validateTeamPin(pin) {
  return /^\d{4}$/.test(String(pin || "").trim());
}

export { detectRuntimeMode, isHostedRuntime, validateTeamPin };
