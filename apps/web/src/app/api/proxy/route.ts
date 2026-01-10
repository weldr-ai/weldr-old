import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@weldr/auth";
import { and, db, eq } from "@weldr/db";
import { projects } from "@weldr/db/schema";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestBody = await request.json();

  const { endpoint, projectId, ...restBody } = requestBody;

  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint is required" }, { status: 400 });
  }

  if (!projectId) {
    return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
  }

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (process.env.NODE_ENV === "production") {
      const appName = `project-development-${projectId}`;

      return new NextResponse(null, {
        status: 200,
        headers: {
          "fly-replay": `app=${appName}`,
        },
      });
    }

    // Development: use localhost
    const url = "http://localhost:8080";

    // Create headers object with only necessary headers
    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("host", "localhost:8080");
    headers.set("origin", "http://localhost:8080");

    const cookie = request.headers.get("cookie");
    if (cookie) {
      headers.set("cookie", cookie);
    }

    const body = JSON.stringify({ projectId, ...restBody });

    const response = await fetch(`${url}${endpoint}?${searchParams.toString()}`, {
      method: "POST",
      headers,
      body,
    });

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
