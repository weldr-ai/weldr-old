// TODO:FIXME: THIS IS COMPLETELY WRONG NOW AND NEEDS TO BE REWRITTEN

"use server";

import { headers } from "next/headers";

import { auth } from "@weldr/auth";
import { and, db, eq, isNotNull } from "@weldr/db";
import { versions } from "@weldr/db/schema";

export async function getProjectDownloadUrl({ projectId }: { projectId: string }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const currentVersion = await db.query.versions.findFirst({
    where: and(
      eq(versions.projectId, projectId),
      eq(versions.userId, session.user.id),
      isNotNull(versions.publishedAt),
    ),
    with: {
      project: {
        columns: {
          title: true,
        },
      },
    },
  });

  if (!currentVersion) {
    throw new Error("Current version not found");
  }

  // const filesList = await db.query.versionFiles.findMany({
  //   where: eq(versionFiles.versionId, currentVersion.id),
  //   with: {
  //     file: true,
  //   },
  // });
  //
  // FIXME: prepare the repo on the dev-node and create a zip file
  // const url = await S3.downloadProject({
  //   projectId,
  //   projectName: currentVersion.project.name ?? "weldr-app",
  //   files: filesList.map((file) => ({
  //     path: file.file.path,
  //     versionId: file.s3VersionId,
  //   })),
  // });
  // return url;
  return "";
}
