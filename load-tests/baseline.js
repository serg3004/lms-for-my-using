import http from "k6/http";
import { check, fail, group, sleep } from "k6";
import { Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

const PROFILES = {
  smoke: { stages: [{ duration: "30s", target: 1 }], gracefulRampDown: "5s" },
  load: {
    stages: [
      { duration: "2m", target: 10 },
      { duration: "5m", target: 10 },
      { duration: "2m", target: 25 },
      { duration: "5m", target: 25 },
      { duration: "2m", target: 0 },
    ],
    gracefulRampDown: "30s",
  },
  stress: {
    stages: [
      { duration: "2m", target: 25 },
      { duration: "3m", target: 50 },
      { duration: "3m", target: 100 },
      { duration: "3m", target: 150 },
      { duration: "2m", target: 0 },
    ],
    gracefulRampDown: "30s",
  },
};

const profile = __ENV.LOAD_TEST_PROFILE || "smoke";
if (!PROFILES[profile])
  fail(`LOAD_TEST_PROFILE must be one of: ${Object.keys(PROFILES).join(", ")}`);

const baseUrl = (__ENV.BASE_URL || "").replace(/\/$/, "");
if (!baseUrl) fail("BASE_URL is required");

const target = new URL(baseUrl);
if (__ENV.LOAD_TEST_ALLOW_HOST !== target.hostname) {
  fail(
    `Refusing target ${target.hostname}: set LOAD_TEST_ALLOW_HOST to that exact hostname`,
  );
}

const looksProduction = /(^|[.-])(prod|production)([.-]|$)/i.test(
  target.hostname,
);
if (
  looksProduction &&
  (__ENV.LOAD_TEST_ALLOW_PRODUCTION !== "true" ||
    __ENV.LOAD_TEST_PRODUCTION_CONFIRM !== "I_UNDERSTAND_THIS_CREATES_LOAD")
) {
  fail(
    "Production-like targets require LOAD_TEST_ALLOW_PRODUCTION=true and the documented confirmation phrase",
  );
}

const datasetPath = __ENV.LOAD_TEST_DATASET || "./dataset.example.json";
const dataset = new SharedArray("load-test-dataset", () => [
  JSON.parse(open(datasetPath)),
])[0];
if (!Array.isArray(dataset.users) || dataset.users.length === 0)
  fail("Dataset must contain at least one user");

const operationLatency = new Trend("operation_latency", true);

export const options = {
  scenarios: { baseline: { executor: "ramping-vus", ...PROFILES[profile] } },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(50)<250", "p(95)<750", "p(99)<1500"],
    operation_latency: ["p(95)<1000"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

function passwordFor(user) {
  const variable = user.passwordEnv || "LOAD_TEST_PASSWORD";
  const password = __ENV[variable];
  if (!password) fail(`${variable} is required for ${user.email}`);
  return password;
}

function request(method, path, body, params = {}) {
  const started = Date.now();
  const response = http.request(method, `${baseUrl}${path}`, body, params);
  operationLatency.add(Date.now() - started, {
    operation: params.tags?.operation || "unknown",
  });
  return response;
}

function jsonParams(operation, token) {
  return {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    tags: { operation },
  };
}

function login(user) {
  const response = request(
    "POST",
    "/auth/login",
    JSON.stringify({
      organizationId: user.organizationId,
      email: user.email,
      password: passwordFor(user),
    }),
    jsonParams("login"),
  );
  check(response, {
    "login succeeds": (r) => r.status === 200 || r.status === 201,
  });
  return response.status === 200 || response.status === 201
    ? response.json("accessToken")
    : null;
}

export default function () {
  const user = dataset.users[(__VU - 1) % dataset.users.length];
  let token;

  group("login", () => {
    token = login(user);
  });
  if (!token) return;

  group("bounded lists", () => {
    for (const path of [
      "/courses?page=1&pageSize=50",
      "/assignments?page=1&pageSize=50",
      "/notifications?limit=20",
    ]) {
      const response = request(
        "GET",
        path,
        null,
        jsonParams(`list:${path.split("?")[0]}`, token),
      );
      check(response, { [`${path} succeeds`]: (r) => r.status === 200 });
    }
  });

  group("refresh", () => {
    const response = request("POST", "/auth/refresh", null, {
      tags: { operation: "refresh" },
    });
    check(response, {
      "refresh succeeds": (r) => r.status === 200 || r.status === 201,
    });
    if (response.status === 200 || response.status === 201) {
      token = response.json("accessToken") || token;
    }
  });

  if (
    __ENV.LOAD_TEST_ENABLE_WRITES === "true" &&
    dataset.assessmentIds?.length
  ) {
    group("assessment submit", () => {
      const index = (__ITER + __VU - 1) % dataset.assessmentIds.length;
      const response = request(
        "POST",
        `/assessments/${dataset.assessmentIds[index]}/attempts`,
        JSON.stringify(dataset.assessmentPayloads[index]),
        jsonParams("assessment-submit", token),
      );
      check(response, {
        "assessment submit succeeds": (r) =>
          r.status === 200 || r.status === 201,
      });
    });
  }

  if (
    __ENV.LOAD_TEST_ENABLE_UPLOADS === "true" &&
    dataset.uploadMaterialIds?.length
  ) {
    group("upload", () => {
      const materialId =
        dataset.uploadMaterialIds[
          (__ITER + __VU - 1) % dataset.uploadMaterialIds.length
        ];
      const response = request(
        "POST",
        `/materials/${materialId}/file`,
        {
          file: http.file(
            "load-test\n",
            `load-${__VU}-${__ITER}.txt`,
            "text/plain",
          ),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          tags: { operation: "upload" },
        },
      );
      check(response, {
        "upload succeeds": (r) => r.status === 200 || r.status === 201,
      });
    });
  }

  sleep(Number(__ENV.LOAD_TEST_THINK_TIME_SECONDS || 1));
}
