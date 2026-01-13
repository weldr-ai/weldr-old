import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  path: "/",
  component: () => <div>Hello World</div>,
});
