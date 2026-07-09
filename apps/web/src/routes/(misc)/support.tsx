import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(misc)/support")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/support"!</div>;
}
