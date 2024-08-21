function envVar(key: string): string;
function envVar(key: string, optional: true): string | undefined;
function envVar(key: string, optional: boolean = false) {
  const value = process.env[key];
  if (!value && !optional) {
    throw new Error(`"${key}" variable is required, but not set.`);
  }
  return value;
}

export const config = {
  resultPrefix: envVar("RESULT_PREFIX"),
  awsKeyId: envVar("AWS_KEY_ID"),
  awsSecretKey: envVar("AWS_SECRET_KEY"),
  bucketMountName: envVar("BUCKET_MOUNT_NAME", true),
};
