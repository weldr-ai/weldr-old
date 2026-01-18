import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
