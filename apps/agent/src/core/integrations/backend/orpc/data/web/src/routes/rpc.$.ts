import { createServerFileRoute } from "@tanstack/react-start/server";

import server from "@repo/server/index";

const handle = ({ request }: { request: Request }) => server.fetch(request);

export const ServerRoute = createServerFileRoute("/rpc/$").methods({
  HEAD: handle,
  GET: handle,
  POST: handle,
  PUT: handle,
  PATCH: handle,
  DELETE: handle,
});
