import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(misc)/privacy")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/privacy"!</div>;
}
