import { serverDatabase } from "../tally-api/handler.ts";
import { authorizedWorker, runJobs } from "../tally-api/jobs/worker.ts";
import { processDeletions } from "../tally-api/accounts/deletion.ts";
Deno.serve(async (request) => {
  if (request.method !== "POST" || !authorizedWorker(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const db = serverDatabase();
    const deletion = await processDeletions(db);
    return Response.json({ ...await runJobs(db), ...deletion });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
});
