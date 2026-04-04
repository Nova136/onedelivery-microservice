#!/usr/bin/env node
/**
 * generate-anygen.js
 *
 * Reads a markdown content file, sends it to the AnyGen AI API as a slide
 * generation task, polls until complete, then downloads the .pptx file.
 *
 * Usage:
 *   node generate-anygen.js <content-file.md> [output.pptx]
 *
 * Example:
 *   node generate-anygen.js content.md onedelivery-anygen.pptx
 *
 * Requires ANYGEN_API_KEY env var or reads from anygen-key.text in the same folder.
 * Get your API key at: https://www.anygen.io/home
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = "https://www.anygen.io";
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 600; // 30 min max (3s × 600)

function getApiKey() {
  if (process.env.ANYGEN_API_KEY) return process.env.ANYGEN_API_KEY;
  const keyFile = path.join(__dirname, "anygen-key.text");
  if (fs.existsSync(keyFile)) return fs.readFileSync(keyFile, "utf8").trim();
  throw new Error(
    "No API key found. Set ANYGEN_API_KEY env var or create presentation/anygen-key.text"
  );
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function createTask(apiKey, prompt) {
  const res = await fetch(`${BASE_URL}/v1/openapi/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operation: "slide",
      prompt,
      extra: { create_from: "generate-anygen-script" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create task (HTTP ${res.status}): ${body}`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(`Task creation failed: ${data.error ?? JSON.stringify(data)}`);
  }

  return { taskId: data.task_id, taskUrl: data.task_url };
}

async function pollTask(apiKey, taskId) {
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const res = await fetch(`${BASE_URL}/v1/openapi/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`Polling error (HTTP ${res.status})`);
    }

    const data = await res.json();
    const status = data.status ?? "unknown";
    const elapsed = ((attempt * POLL_INTERVAL_MS) / 1000).toFixed(0);

    process.stdout.write(
      `\r  [${elapsed}s] status: ${status.padEnd(12)}`
    );

    if (status === "completed") {
      // Artifact may not be ready immediately after completion — keep polling
      // until files appear or export_status is no longer "no_artifact".
      const files = extractFiles(data);
      const exportStatus = data.output?.export_status ?? "";
      if (files.length > 0) {
        process.stdout.write("\n");
        return data;
      }
      if (exportStatus === "no_artifact") {
        process.stdout.write(
          `\r  [${elapsed}s] status: completed     (export pending...)`
        );
        continue;
      }
      process.stdout.write("\n");
      return data;
    }

    if (status === "failed") {
      process.stdout.write("\n");
      throw new Error(`Task failed: ${JSON.stringify(data.error ?? data)}`);
    }
  }

  throw new Error("Timed out waiting for task to complete (30 min).");
}

async function downloadFile(fileUrl, outputPath) {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
}

function extractFiles(taskData) {
  const output = taskData.output ?? {};

  // New API format: output.files[]
  if (Array.isArray(output.files) && output.files.length > 0) {
    return output.files; // [{ url, name }, ...]
  }

  // Legacy format: output.file_url + output.file_name
  if (output.file_url) {
    return [{ url: output.file_url, name: output.file_name ?? "output.pptx" }];
  }

  return [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const [, , contentFile, outputFile] = process.argv;

if (!contentFile) {
  console.error("Usage: node generate-anygen.js <content-file.md> [output.pptx]");
  process.exit(1);
}

if (!fs.existsSync(contentFile)) {
  console.error(`Content file not found: ${contentFile}`);
  process.exit(1);
}

const rawMarkdown = fs.readFileSync(contentFile, "utf8");
const contentDir = path.dirname(path.resolve(contentFile));

// Embed local image references as base64 data URIs so AnyGen receives the
// actual image bytes rather than an unresolvable local filesystem path.
// Matches: ![alt text](relative/or/absolute/path.png)
// Skips:   already-embedded data URIs and http(s) URLs
function embedImages(markdown, baseDir) {
  return markdown.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (match, alt, src) => {
      if (src.startsWith("data:") || src.startsWith("http")) return match;
      const imgPath = path.resolve(baseDir, src);
      if (!fs.existsSync(imgPath)) {
        console.warn(`  [warn] Image not found, skipping embed: ${imgPath}`);
        return match;
      }
      const ext = path.extname(imgPath).toLowerCase().replace(".", "");
      const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      const b64 = fs.readFileSync(imgPath).toString("base64");
      console.log(`  [embed] ${src} (${(b64.length * 0.75 / 1024).toFixed(0)} KB)`);
      return `![${alt}](data:${mime};base64,${b64})`;
    }
  );
}

const markdownContent = embedImages(rawMarkdown, contentDir);
const apiKey = getApiKey();

const defaultOutput =
  path.basename(contentFile, path.extname(contentFile)) + "-anygen.pptx";
const outputPath = outputFile ?? defaultOutput;

console.log(`\n==> Reading content from : ${contentFile}`);
console.log(`==> Output will be saved : ${outputPath}`);
console.log(`==> Embedding local images as base64 data URIs...`);

console.log(`==> Starting AnyGen slide generation...`);

try {
  const { taskId, taskUrl } = await createTask(apiKey, markdownContent);
  console.log(`==> Task created (ID: ${taskId})`);
  if (taskUrl) console.log(`    Preview: ${taskUrl}`);
  console.log(`==> Polling for completion (every 3s, up to 30 min)...`);

  const result = await pollTask(apiKey, taskId);

  console.log(`\n==> Generation complete!`);
  if (result.output?.task_url) {
    console.log(`    View online  : ${result.output.task_url}`);
  }
  if (result.output?.thumbnail_url) {
    console.log(`    Thumbnail    : ${result.output.thumbnail_url}`);
  }
  if (result.output?.slide_count) {
    console.log(`    Slides       : ${result.output.slide_count}`);
  }

  const files = extractFiles(result);
  if (files.length === 0) {
    console.warn("  No downloadable files found in task output.");
    console.log("  Full output:", JSON.stringify(result.output, null, 2));
    process.exit(1);
  }

  if (files.length === 1) {
    console.log(`==> Downloading file...`);
    await downloadFile(files[0].url, outputPath);
    console.log(`\n✓ Saved: ${outputPath}`);
  } else {
    // Multiple files — save each with its original name
    console.log(`==> Downloading ${files.length} files...`);
    const outDir = path.dirname(outputPath);
    for (const file of files) {
      const dest = path.join(outDir, file.name);
      await downloadFile(file.url, dest);
      console.log(`✓ Saved: ${dest}`);
    }
  }
} catch (err) {
  console.error("\nERROR:", err.message);
  process.exit(1);
}
