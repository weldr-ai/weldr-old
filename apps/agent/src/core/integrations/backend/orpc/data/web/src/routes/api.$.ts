import { createServerFileRoute } from "@tanstack/react-start/server";

import server from "@repo/server/index";

const handle = ({ request }: { request: Request }) => server.fetch(request);

export const ServerRoute = createServerFileRoute("/api/$").methods({
  GET: handle,
  POST: handle,
  PUT: handle,
  DELETE: handle,
  OPTIONS: handle,
  HEAD: handle,
});
