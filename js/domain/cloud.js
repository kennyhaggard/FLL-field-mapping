import {
  SUPABASE_ANON_KEY,
  SUPABASE_FN_BASE
} from "./constants.js";

function createCloudClient({
  runtime,
  fetchImpl = globalThis.fetch,
  baseUrl = SUPABASE_FN_BASE,
  anonKey = SUPABASE_ANON_KEY
} = {}) {
  async function post(path, payload) {
    if (!runtime?.allowsCloudSync) {
      throw new Error("cloud-disabled");
    }
    if (typeof fetchImpl !== "function") {
      throw new Error("fetch-unavailable");
    }

    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey
        },
        body: JSON.stringify(payload || {})
      });

      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (error) {
        return {
          ok: false,
          status: response.status,
          error: `Cloud function returned a non-JSON response (${response.status}).`
        };
      }

      if (!response.ok && data && typeof data === "object" && !data.status) {
        data.status = response.status;
      }
      return data;
    } catch (error) {
      return {
        ok: false,
        error: error?.message || "Network error contacting cloud function."
      };
    }
  }

  function teamPayload(session) {
    return {
      teamName: session.name,
      teamPin: session.pin,
      pin: session.pin
    };
  }

  return {
    async registerTeam({ teamName, pin, coachEmail, turnstileToken }) {
      return post("/register_team", {
        teamName,
        pin,
        coachEmail,
        turnstileToken
      });
    },
    async listMissions(session) {
      return post("/list_missions", teamPayload(session));
    },
    async getMission(session, missionName) {
      return post("/get_mission", {
        ...teamPayload(session),
        missionName
      });
    },
    async saveMission(session, mission) {
      return post("/save_mission", {
        ...teamPayload(session),
        missionName: mission.name,
        mission
      });
    },
    async deleteMission(session, missionName) {
      return post("/delete_mission", {
        ...teamPayload(session),
        missionName
      });
    },
    async listRobots(session) {
      return post("/list_robots", teamPayload(session));
    },
    async getRobot(session, robotName) {
      return post("/get_robot", {
        ...teamPayload(session),
        robotName
      });
    },
    async saveRobot(session, robot) {
      return post("/save_robot", {
        ...teamPayload(session),
        robotName: robot.name,
        robot
      });
    },
    async deleteRobot(session, robotName) {
      return post("/delete_robot", {
        ...teamPayload(session),
        robotName
      });
    }
  };
}

export { createCloudClient };
