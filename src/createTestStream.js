import fs from "fs";
import os from "os";
import path from "path";

import { Bee } from "@ethersphere/bee-js";
import pkg from "@fairdatasociety/bmt-js";
const { makeChunkedFile } = pkg;

import {
  generateRandomData,
  bytesToHex,
  remove0xPrefix,
  convertTo16HexString,
} from "./utils.js";
import { AsyncQueue } from "./asyncQueue.js";

const NODE_ADDRESS = "";
const UPLOADER_NODE = `http://${NODE_ADDRESS}`;

const STAMP = "";
const SIGNER = {
  key: "",
  address: "",
};
const beeUpload = new Bee(UPLOADER_NODE);

let feedWriterManifest;
let feedWriterSegment;
let TOPIC_MANIFEST;
let TOPIC_SEGMENT;

async function initManifestFeed() {
  try {
    const rawTopic = bytesToHex(generateRandomData(1000));
    TOPIC_MANIFEST = beeUpload.makeFeedTopic(rawTopic);
    console.log(`MANIFEST TOPIC: ${TOPIC_MANIFEST}`);

    await beeUpload.createFeedManifest(
      STAMP,
      "sequence",
      TOPIC_MANIFEST,
      SIGNER.address
    );
    feedWriterManifest = beeUpload.makeFeedWriter(
      "sequence",
      TOPIC_MANIFEST,
      SIGNER.key
    );
  } catch (error) {
    console.error(`INIT FEED_MANIFEST ERROR ${error.message}`);
  }
}

async function initSegmentFeed() {
  try {
    const rawTopic = bytesToHex(generateRandomData(1000));
    TOPIC_SEGMENT = beeUpload.makeFeedTopic(rawTopic);
    console.log(`TOPIC SEGMENT: ${TOPIC_SEGMENT}`);

    await beeUpload.createFeedManifest(
      STAMP,
      "sequence",
      TOPIC_SEGMENT,
      SIGNER.address
    );
    feedWriterSegment = beeUpload.makeFeedWriter(
      "sequence",
      TOPIC_SEGMENT,
      SIGNER.key
    );
  } catch (error) {
    console.error(`INIT FEED_SEGMENT ERROR ${error.message}`);
  }
}

async function updateManifestFeed(index, data) {
  console.log(`UPDATE FEED_MANIFEST ${index}`);
  try {
    await feedWriterManifest.upload(STAMP, data, { index });
    console.log(`UPDATE FEED_MANIFEST COMPLETE ${index}`);
  } catch (error) {
    console.error(`UPDATE FEED_MANIFEST ERROR ${error.message}`);
  }
}

async function updateSegmentFeed(index, data, key) {
  console.log(`UPDATE FEED_SEGMENT ${index} - ${key}`);
  try {
    await beeUpload.uploadData(STAMP, data);

    const chunkedFile = makeChunkedFile(data);
    const rootChunk = chunkedFile.rootChunk();
    await feedWriterSegment.upload(
      STAMP,
      { chunkPayload: rootChunk.payload, chunkSpan: rootChunk.span() },
      { index }
    );

    console.log(`UPDATE FEED_SEGMENT COMPLETE ${index}`);
  } catch (error) {
    console.error(`UPDATE FEED_SEGMENT ERROR ${error.message}`);
  }
}

let pathToManifest;
let segmentBuffer = {};
const localStorePath = path.join(os.homedir(), ".lpData", "offchain");
function mapLocalStore() {
  try {
    const files = fs.readdirSync(localStorePath);
    files.forEach((file) => {
      if (!pathToManifest && file.includes(".m3u8")) {
        pathToManifest = path.join(localStorePath, file);
      }
      if (file.includes(".ts") && !segmentBuffer[file]?.done) {
        const segmentData = fs.readFileSync(path.join(localStorePath, file));
        segmentBuffer[file] = {
          done: false,
          data: segmentData,
        };
      }
    });
  } catch (err) {
    console.log("ERROR READING LOCAL STORE", err);
  }
}

let FIRST_SEGMENT_INDEX;
const segmentIndexRegex = /_(\d+)\.ts$/;
function produceSwarmManifest() {
  const manifestData = fs.readFileSync(pathToManifest, "utf8");

  const lines = manifestData.split("\n");

  const swarmBase = `http://${NODE_ADDRESS}/soc/${remove0xPrefix(
    SIGNER.address
  )}/${TOPIC_SEGMENT}`;

  const modifiedLines = lines.map((line) => {
    const match = line.match(segmentIndexRegex);
    if (match) {
      if (!FIRST_SEGMENT_INDEX) {
        FIRST_SEGMENT_INDEX = match[1];
      }
      return `${swarmBase}/${match[1]}`;
    }
    return line;
  });

  const modifiedManifest = modifiedLines.join("\n");
  const manifestBuffer = Buffer.from(modifiedManifest, "utf8");
  const uint8Manifest = new Uint8Array(
    manifestBuffer.buffer,
    manifestBuffer.byteOffset,
    manifestBuffer.byteLength
  );

  return uint8Manifest;
}

let manifestQueue;
let segmentQueue;
function initQueues() {
  // init run for globals - TODO
  mapLocalStore();
  produceSwarmManifest();

  manifestQueue = new AsyncQueue({
    waitable: true,
    indexed: true,
  });
  segmentQueue = new AsyncQueue({
    waitable: true,
    indexed: true,
    index: convertTo16HexString(Number(FIRST_SEGMENT_INDEX)),
  });
}

async function toSWAAAAARM(manifestData) {
  const segmentKeys = Object.keys(segmentBuffer);

  segmentKeys.forEach((key) => {
    const segment = segmentBuffer[key];
    if (!segment.done) {
      segmentQueue.enqueue((index) =>
        updateSegmentFeed(index, segment.data, key)
      );
      segment.done = true;
    }
  });

  manifestQueue.enqueue((index) => updateManifestFeed(index, manifestData));
}

async function Start() {
  await initManifestFeed();
  await initSegmentFeed();
  initQueues();

  const TIMESLICE = 2000;
  setInterval(() => {
    mapLocalStore();
    const manifestData = produceSwarmManifest();
    toSWAAAAARM(manifestData);
  }, [TIMESLICE]);
}

Start();
