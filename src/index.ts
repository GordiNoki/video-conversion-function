import { createReadStream, createWriteStream } from "fs";
import { stat } from "fs/promises";
import { spawn } from "child_process";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { HandlerEvent } from "./types/handler-event";
import { config } from "./config";

const client = new S3Client({
  region: "ru-central1",
  endpoint: "https://storage.yandexcloud.net",
  credentials: {
    accessKeyId: config.awsKeyId,
    secretAccessKey: config.awsSecretKey,
  },
  forcePathStyle: true,
});

export async function handler(event: HandlerEvent, _ctx: any) {
  if (event.messages && Array.isArray(event.messages)) {
    for (const message of event.messages) {
      if (
        message.event_metadata &&
        message.event_metadata.event_type ===
          "yandex.cloud.events.storage.ObjectCreate" &&
        message.details &&
        message.details.object_id &&
        message.details.bucket_id
      ) {
        await action(message.details.bucket_id, message.details.object_id);
      }
    }
  }
}

async function action(bucketId: string, objectId: string) {
  const workFileName = objectId.split("/").at(-1)!;
  const resFileName = workFileName.split(".").slice(0, -1).join(".") + ".webm";

  let workFilePath = "/tmp/" + workFileName;
  let resFilePath = "/tmp/" + resFileName;

  const useBucketMount = await checkBucketMount(objectId, resFileName);
  if (useBucketMount) {
    console.log("Using bucket mount.");
    workFilePath = useBucketMount.workFile;
    resFilePath = useBucketMount.resFile;
  }

  if (!useBucketMount) {
    await downloadFile(bucketId, objectId, workFilePath);
  }

  await runFFMpeg(workFilePath, resFilePath);

  if (!useBucketMount) {
    await uploadFile(bucketId, config.resultPrefix + resFileName, resFilePath);
  }

  console.log(objectId + " is done.");
}

async function checkBucketMount(objectId: string, resFileName: string) {
  if (!config.bucketMountName) return false;

  const bucketMount = await stat(
    "/function/storage/" + config.bucketMountName
  ).catch(() => null);

  if (!bucketMount || !bucketMount.isDirectory()) return false;

  const targetFile = await stat(
    `/function/storage/${config.bucketMountName}/${objectId}`
  ).catch(() => null);

  return !!targetFile
    ? {
        workFile: `/function/storage/${config.bucketMountName}/${objectId}`,
        resFile: `/function/storage/${config.bucketMountName}/${config.resultPrefix}${resFileName}`,
      }
    : null;
}

async function downloadFile(
  bucketId: string,
  objectId: string,
  destination: string
) {
  console.log("Getting " + objectId);
  const getCommand = new GetObjectCommand({
    Bucket: bucketId,
    Key: objectId,
  });

  const result = await client.send(getCommand);
  if (!result.Body) throw new Error("Object recieved with no body.");

  const file = createWriteStream(destination);
  const bodyReader = result.Body?.transformToWebStream().getReader();
  console.log("Downloading " + objectId);

  const contentSize = result.ContentLength || 1;
  let downloadedSize = 0;
  const logInterval = setInterval(
    () =>
      console.log(
        `${downloadedSize} / ${contentSize} (${(
          (downloadedSize / contentSize) *
          100
        ).toFixed(2)}%)`
      ),
    1000
  );

  while (true) {
    const { done, value }: { done: boolean; value?: Uint8Array } =
      await bodyReader.read();
    if (done) break;

    await new Promise((res) => file.write(value, res));
    downloadedSize += value!.length;
  }

  clearInterval(logInterval);

  await new Promise((res) => file.close(res));
}

async function runFFMpeg(inFilePath: string, outFilePath: string) {
  console.log(`Running ffmpeg: ${inFilePath} -> ${outFilePath}`);
  //ffmpeg -hide_banner -v warning -stats -y -i "$file" -vf "scale='if(gt(iw/ih,16/9),1280,-2)':'if(gt(iw/ih,16/9),-2,1280)'" -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -crf 25 $name_vp9.webm
  return new Promise<void>((res, _rej) => {
    const subprocess = spawn("./ffmpeg", [
      "-hide_banner",
      "-v",
      "warning",
      "-stats",
      "-y",
      "-i",
      inFilePath,
      "-vf",
      "scale='if(gt(iw/ih,16/9),1280,-2)':'if(gt(iw/ih,16/9),-2,720)'",
      "-c:v",
      "libvpx-vp9",
      "-deadline",
      "realtime",
      "-cpu-used",
      "8",
      "-crf",
      "25",
      outFilePath,
    ]);

    subprocess.once("error", (err) => {
      throw err;
    });

    subprocess.stderr.on("data", (chunk: Buffer) => {
      let data = chunk.toString();
      if (!chunk.includes("\n")) data += "\n";
      process.stdout.write(data);
    });

    subprocess.once("close", (code) => {
      if (code !== 0)
        throw new Error("ffmpeg exited with status code: " + code);
      res();
    });
  });
}

async function uploadFile(bucketId: string, objectId: string, source: string) {
  const file = createReadStream(source);
  console.log("Uploading " + objectId);

  const putCommand = new PutObjectCommand({
    Bucket: bucketId,
    Key: objectId,
    Body: file,
  });

  await client.send(putCommand);
}
