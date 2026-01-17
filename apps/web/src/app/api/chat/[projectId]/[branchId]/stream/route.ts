import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@weldr/auth";
import { and, db, eq } from "@weldr/db";
import { branches, projects } from "@weldr/db/schema";

import { isLocalMode } from "@/lib/mode";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; branchId: string }> },
) {
  try {
    const { projectId, branchId } = await params;

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

    const branch = await db.query.branches.findFirst({
      where: and(eq(branches.id, branchId), eq(branches.projectId, projectId)),
    });

    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    if (!branch.snapshotId) {
      return NextResponse.json({ error: "Branch has no active snapshot" }, { status: 404 });
    }

    if (!isLocalMode()) {
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

    // Create headers object, preserving original headers but updating origin-related ones
    const headers = new Headers();

    // Copy all headers from the original request except origin-related ones
    request.headers.forEach((value, key) => {
      if (!["host", "origin", "referer"].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    // Set the new origin and host for the destination
    headers.set("host", "localhost:8080");
    headers.set("origin", "http://localhost:8080");

    // Build the stream URL with offset parameter for Durable Streams resumption
    const { searchParams } = new URL(request.url);
    const offset = searchParams.get("offset");
    const streamUrl = new URL(`${url}/stream/${projectId}/${branch.snapshotId}`);
    if (offset) {
      streamUrl.searchParams.set("offset", offset);
    }

    // Make the proxy request to the agent service
    const response = await fetch(streamUrl.toString(), {
      method: "GET",
      headers,
    });

    // Stream the SSE response, including the X-Stream-Offset header for client resumption
    const responseHeaders: Record<string, string> = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
      "Access-Control-Expose-Headers": "X-Stream-Offset, X-Stream-ID",
    };

    // Forward the stream offset header from the agent response
    const streamOffset = response.headers.get("X-Stream-Offset");
    if (streamOffset) {
      responseHeaders["X-Stream-Offset"] = streamOffset;
    }

    const streamId = response.headers.get("X-Stream-ID");
    if (streamId) {
      responseHeaders["X-Stream-ID"] = streamId;
    }

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
