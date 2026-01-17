// TODO:FIXME: THIS IS COMPLETELY WRONG NOW AND NEEDS TO BE REWRITTEN

"use server";

import { headers } from "next/headers";

import { auth } from "@weldr/auth";
import { and, db, eq } from "@weldr/db";
import { branches } from "@weldr/db/schema";

export async function getProjectDownloadUrl({ projectId }: { projectId: string }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new Error("Unauthorized");
  }

  // Get the main branch for this project
  const mainBranch = await db.query.branches.findFirst({
    where: and(eq(branches.projectId, projectId), eq(branches.name, "main")),
    with: {
      snapshot: {
        with: {
          project: {
            columns: {
              title: true,
            },
          },
        },
      },
    },
  });

  if (!mainBranch?.snapshot) {
    throw new Error("Current snapshot not found");
  }

  // FIXME: prepare the repo on the dev-node and create a zip file
  // const url = await S3.downloadProject({
  //   projectId,
  //   projectName: mainBranch.snapshot.project.title ?? "weldr-app",
  //   files: [],
  // });
  // return url;
  return "";
}
