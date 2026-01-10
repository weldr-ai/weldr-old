import {
  AttachUserPolicyCommand,
  CreateAccessKeyCommand,
  CreatePolicyCommand,
  DeleteAccessKeyCommand,
  DeletePolicyCommand,
  IAMClient,
  ListAccessKeysCommand,
  ListPoliciesCommand,
} from "@aws-sdk/client-iam";
import {
  type CreateBucketOptions,
  type CreateBucketResponse,
  createBucket as tigrisCreateBucket,
  getPresignedUrl as tigrisGetPresignedUrl,
  removeBucket as tigrisRemoveBucket,
} from "@tigrisdata/storage";

import { Logger } from "./logger";

interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

const iamClient = new IAMClient({
  region: "auto",
  endpoint: process.env.TIGRIS_IAM_ENDPOINT ?? "https://iam.storage.dev",
  credentials: {
    accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY ?? "",
  },
});

const tigrisConfig = {
  accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY ?? "",
};

async function createBucket(
  bucketName: string,
  options?: CreateBucketOptions,
): Promise<CreateBucketResponse> {
  try {
    const response = await tigrisCreateBucket(bucketName, {
      ...options,
      config: tigrisConfig,
    });

    if (response.error) {
      throw response.error;
    }

    Logger.info("Create bucket response", {
      bucketName,
      response: response.data,
    });

    return response.data;
  } catch (error) {
    Logger.error("Create bucket error", {
      bucketName,
      error,
    });
    throw error;
  }
}

async function deleteBucket(bucketName: string): Promise<void> {
  try {
    const response = await tigrisRemoveBucket(bucketName, {
      config: tigrisConfig,
    });

    if (response.error) {
      // Check if it's a 404 error (bucket not found)
      const errorMessage = response.error.message || "";
      if (errorMessage.includes("404") || errorMessage.includes("not found")) {
        return;
      }
      throw response.error;
    }

    Logger.info("Delete bucket response", {
      bucketName,
      response: response.data,
    });
  } catch (error) {
    Logger.error("Delete bucket error", {
      bucketName,
      error,
    });
    throw error;
  }
}

function createProjectPolicyDocument(projectId: string): string {
  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "ListObjectsInProjectBuckets",
        Effect: "Allow",
        Action: ["s3:ListBucket"],
        Resource: [`arn:aws:s3:::project-${projectId}-*`],
      },
      {
        Sid: "ManageAllObjectsInProjectBuckets",
        Effect: "Allow",
        Action: ["s3:*"],
        Resource: [`arn:aws:s3:::project-${projectId}-*/*`],
      },
    ],
  };
  return JSON.stringify(policy);
}

async function createAccessKey(
  bucketName: string,
): Promise<{ accessKeyId: string; secretAccessKey: string }> {
  try {
    const accessKeyResponse = await iamClient.send(
      new CreateAccessKeyCommand({
        UserName: bucketName,
      }),
    );
    Logger.info("Create credentials access key response", {
      bucketName,
      accessKeyResponse,
    });

    if (
      !accessKeyResponse.AccessKey?.AccessKeyId ||
      !accessKeyResponse.AccessKey?.SecretAccessKey
    ) {
      throw new Error("Failed to create access key");
    }

    return {
      accessKeyId: accessKeyResponse.AccessKey.AccessKeyId,
      secretAccessKey: accessKeyResponse.AccessKey.SecretAccessKey,
    };
  } catch (error) {
    Logger.error("Create access key error", {
      bucketName,
      error,
    });
    throw error;
  }
}

async function findAccessKey(bucketName: string): Promise<string | undefined> {
  try {
    const response = await iamClient.send(
      new ListAccessKeysCommand({
        UserName: bucketName,
      }),
    );
    const accessKey = response.AccessKeyMetadata?.[0];
    return accessKey?.AccessKeyId;
  } catch (error) {
    Logger.error("Find access key error", {
      bucketName,
      error,
    });
    return undefined;
  }
}

async function deleteAccessKey(bucketName: string): Promise<Error | undefined> {
  try {
    const accessKeyId = await findAccessKey(bucketName);

    if (!accessKeyId) {
      Logger.info("Access key not found", {
        bucketName,
      });
      return undefined;
    }

    const response = await iamClient.send(
      new DeleteAccessKeyCommand({
        UserName: bucketName,
        AccessKeyId: accessKeyId,
      }),
    );
    Logger.info("Delete access key response", {
      bucketName,
      accessKeyId,
      response,
    });
    return undefined;
  } catch (error) {
    Logger.error("Delete access key error", {
      bucketName,
      error,
    });
    return new Error(`Failed to delete access key: ${(error as Error).message}`);
  }
}

async function createProjectPolicy(projectId: string): Promise<string> {
  try {
    const policyName = `project-${projectId}-policy`;
    const policyDocument = createProjectPolicyDocument(projectId);
    const policyResponse = await iamClient.send(
      new CreatePolicyCommand({
        PolicyName: policyName,
        PolicyDocument: policyDocument,
      }),
    );
    Logger.info("Create project policy response", {
      projectId,
      policyResponse,
    });

    if (!policyResponse.Policy?.Arn) {
      throw new Error("Failed to create policy: Missing policy ARN in response");
    }

    return policyResponse.Policy.Arn;
  } catch (error) {
    Logger.error("Create project policy error", {
      projectId,
      error,
    });
    throw error;
  }
}

async function attachPolicyToUser(accessKeyId: string, policyArn: string): Promise<void> {
  try {
    await iamClient.send(
      new AttachUserPolicyCommand({
        UserName: accessKeyId,
        PolicyArn: policyArn,
      }),
    );
    Logger.info("Attached policy", {
      accessKeyId,
      policyArn,
    });
  } catch (error) {
    Logger.error("Attach policy error", {
      accessKeyId,
      policyArn,
      error,
    });
    throw error;
  }
}

async function findProjectPolicyByName(projectId: string): Promise<string | undefined> {
  try {
    const policyName = `project-${projectId}-policy`;
    const listPoliciesResponse = await iamClient.send(
      new ListPoliciesCommand({
        Scope: "Local",
        MaxItems: 1000,
      }),
    );

    const policy = listPoliciesResponse.Policies?.find((p) => p.PolicyName === policyName);
    return policy?.Arn;
  } catch (error) {
    Logger.error("Failed to find project policy by name", {
      projectId,
      error,
    });
    return undefined;
  }
}

async function deleteProjectPolicy(projectId: string): Promise<Error | undefined> {
  try {
    const policyName = `project-${projectId}-policy`;
    const policyArn = await findProjectPolicyByName(projectId);

    if (!policyArn) {
      Logger.info("Project policy not found", {
        policyName,
        projectId,
      });
      return undefined;
    }

    const response = await iamClient.send(
      new DeletePolicyCommand({
        PolicyArn: policyArn,
      }),
    );
    Logger.info("Delete project policy response", {
      projectId,
      response,
    });
    return undefined;
  } catch (error) {
    Logger.error("Delete project policy error", {
      projectId,
      error,
    });
    return new Error(`Failed to delete policy: ${(error as Error).message}`);
  }
}

async function createCredentials(projectId: string): Promise<Credentials> {
  try {
    const userName = `project-${projectId}`;
    const accessKey = await createAccessKey(userName);

    const policyArn = await createProjectPolicy(projectId);

    await attachPolicyToUser(accessKey.accessKeyId, policyArn);

    Logger.info("Project credentials created", {
      projectId,
      accessKeyId: accessKey.accessKeyId,
    });

    return {
      accessKeyId: accessKey.accessKeyId,
      secretAccessKey: accessKey.secretAccessKey,
    };
  } catch (error) {
    Logger.error("Create project credentials error", {
      projectId,
      error,
    });
    throw error;
  }
}

async function deleteCredentials(projectId: string): Promise<Error | undefined> {
  const userName = `project-${projectId}`;
  const errors = await Promise.all([deleteAccessKey(userName), deleteProjectPolicy(projectId)]);

  const error = errors.find((e) => e !== undefined);
  if (error) {
    Logger.error("Failed to delete project credentials", {
      projectId,
      error,
    });
    return error;
  }

  Logger.info("Project credentials deleted", {
    projectId,
  });
  return undefined;
}

async function getObjectSignedUrl(
  bucketName: string,
  objectKey: string,
  expiresIn = 3600,
): Promise<string> {
  const response = await tigrisGetPresignedUrl(objectKey, {
    operation: "get",
    expiresIn,
    config: {
      ...tigrisConfig,
      bucket: bucketName,
    },
  });

  if (response.error) {
    Logger.error("Get presigned URL error", {
      bucketName,
      objectKey,
      error: response.error,
    });
    throw response.error;
  }

  return response.data?.url ?? "";
}

export const Tigris = {
  bucket: {
    create: createBucket,
    delete: deleteBucket,
  },
  credentials: {
    create: createCredentials,
    delete: deleteCredentials,
  },
  object: {
    getSignedUrl: getObjectSignedUrl,
  },
};
