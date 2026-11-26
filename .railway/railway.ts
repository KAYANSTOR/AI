import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "kayan-ai";
export default defineRailway(() => {
  const kayanAi = service("kayan-ai", {
    source: github("KAYANSTOR/AI", { branch: "branch1", checkSuites: false }),
    build: { buildCommand: "npm run build", buildEnvironment: "V3", builder: "RAILPACK" },
    start: "node start-with-gateway.mjs",
    healthcheck: "/",
    healthcheckTimeout: 120,
    preDeploy: "npm run db:migrate",
    replicas: { "iad": 1 },
    deploy: { preDeployTimeoutSeconds: 600, restartPolicyMaxRetries: 5 },
    networking: { privateNetworkEndpoint: "frontdesk-web" },
  });

  return project("KAYAN AI", {
    variables: { managed: false },
    resources: [kayanAi],
  });
});
