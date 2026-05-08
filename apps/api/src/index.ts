import { buildServer } from "./http/server.js";
import { getConfig } from "./config.js";

const cfg = getConfig();
const app = await buildServer();

app.listen({ port: cfg.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

