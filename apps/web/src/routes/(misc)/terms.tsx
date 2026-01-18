import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(misc)/terms")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/terms"!</div>;
}
