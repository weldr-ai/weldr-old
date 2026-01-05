import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@weldr/auth";
import { and, db, eq } from "@weldr/db";
import { projects } from "@weldr/db/schema";
import { isLocalMode } from "@weldr/shared/state";

import {
  getDevServer,
  startDevServer,
  updateLastAccessed,
} from "@/lib/dev-server-manager";

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; branchId: string; path: string[] }>;
  },
) {
  const { projectId, branchId, path } = await params;
  return handlePreviewRequest(request, projectId, branchId, path);
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; branchId: string; path: string[] }>;
  },
) {
  const { projectId, branchId, path } = await params;
  return handlePreviewRequest(request, projectId, branchId, path);
}

export async function PUT(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; branchId: string; path: string[] }>;
  },
) {
  const { projectId, branchId, path } = await params;
  return handlePreviewRequest(request, projectId, branchId, path);
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; branchId: string; path: string[] }>;
  },
) {
  const { projectId, branchId, path } = await params;
  return handlePreviewRequest(request, projectId, branchId, path);
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; branchId: string; path: string[] }>;
  },
) {
  const { projectId, branchId, path } = await params;
  return handlePreviewRequest(request, projectId, branchId, path);
}

async function handlePreviewRequest(
  request: NextRequest,
  projectId: string,
  branchId: string,
  pathSegments: string[],
) {
  try {
    // Cloud mode: This endpoint should not be called in cloud mode
    // In cloud mode, preview requests go directly to isolated Fly.io machines
    if (!isLocalMode()) {
      return NextResponse.json(
        { error: "Preview endpoint is only available in local mode" },
        { status: 404 },
      );
    }

    // Authenticate user
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user owns the project
    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        eq(projects.userId, session.user.id),
      ),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Build the path
    const path = pathSegments.join("/");

    // Local mode: manage dev servers directly
    // Runs servers on ports 9000-9009 with LRU eviction
    const existingServer = getDevServer(projectId, branchId);

    let port: number;

    if (existingServer) {
      console.log(`Dev server already running on port ${existingServer.port}`);
      await updateLastAccessed(projectId, branchId);
      port = existingServer.port;
    } else {
      // Start new dev server
      console.log("Starting new dev server");
      const result = await startDevServer(projectId, branchId);

      if (result.status === "error") {
        return NextResponse.json(
          { error: "Failed to start dev server" },
          { status: 503 },
        );
      }

      port = result.port;
    }

    // Proxy to dev server
    const targetUrl = `http://localhost:${port}/${path}${
      request.nextUrl.search || ""
    }`;

    const proxyHeaders = new Headers();

    // Copy headers except host and origin
    request.headers.forEach((value, key) => {
      if (!["host", "origin", "referer"].includes(key.toLowerCase())) {
        proxyHeaders.set(key, value);
      }
    });

    // Set appropriate headers for destination
    proxyHeaders.set("host", `localhost:${port}`);
    proxyHeaders.set("origin", `http://localhost:${port}`);

    // Get request body if applicable
    let body: ReadableStream<Uint8Array> | null = null;
    if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
      body = request.body;
    }

    const proxyResponse = await fetch(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body,
      // @ts-expect-error - duplex is required for streaming
      duplex: "half",
    });

    // Create response with proxied headers
    const responseHeaders = new Headers();
    proxyResponse.headers.forEach((value, key) => {
      // Don't copy certain headers
      if (
        ![
          "content-encoding",
          "content-length",
          "transfer-encoding",
          "connection",
        ].includes(key.toLowerCase())
      ) {
        responseHeaders.set(key, value);
      }
    });

    // Return the proxied response
    return new Response(proxyResponse.body, {
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Preview proxy error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
