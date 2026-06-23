/**
 * server.ts
 *
 * Express API server exposing the handyman estimator to your frontend.
 *
 * POST /estimate
 *   Body (multipart/form-data):
 *     - taskId: string (required) — one of the IDs from taskRegistry.ts
 *     - params: JSON string of user-provided parameter values
 *     - media: one or more image/video files (optional, any count, any mix)
 *
 * GET /tasks
 *   Returns the full task registry for the frontend to render dynamic forms.
 *
 * Media normalization:
 *   Every uploaded file is checked for HEIC/MOV and auto-converted to
 *   JPEG/MP4 respectively before being sent to Gemini — same logic as
 *   testLocal.ts, applied here to real user uploads.
 */

import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import { estimateHandymanTask } from "./orchestration";
import { TASK_REGISTRY, getTasksByCategory } from "./taskRegistry";
import { MediaInput } from "./types";
import { normalizeMediaForGemini, needsConversion } from "./mediaConversion";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "video/mp4", "video/quicktime", "video/webm",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB per file — phone videos can be large pre-conversion
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

app.use(cors());
app.use(express.json());

// ─── GET /tasks ───────────────────────────────────────────────────────────────

app.get("/tasks", (_req, res) => {
  res.json({
    tasks: TASK_REGISTRY.map(({ id, label, category, params }) => ({ id, label, category, params })),
    byCategory: Object.fromEntries(
      Object.entries(getTasksByCategory()).map(([cat, tasks]) => [
        cat,
        tasks.map(({ id, label }) => ({ id, label })),
      ])
    ),
  });
});

// ─── POST /estimate ───────────────────────────────────────────────────────────

app.post(
  "/estimate",
  upload.array("media"),
  async (req, res) => {
    try {
      const taskId = req.body.taskId as string;
      if (!taskId) {
        return res.status(400).json({ success: false, error: "taskId is required" });
      }

      let params: Record<string, unknown> = {};
      if (req.body.params) {
        try {
          params = JSON.parse(req.body.params);
        } catch {
          return res.status(400).json({ success: false, error: "params must be valid JSON" });
        }
      }

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];

      // ── Normalize every file: convert HEIC -> JPEG and MOV -> MP4 ──────────
      const media: MediaInput[] = await Promise.all(
        files.map(async (file) => {
          let buffer = file.buffer;
          let mimeType = file.mimetype;

          if (needsConversion(mimeType)) {
            console.log(`[server] Converting ${file.originalname} (${mimeType})...`);
            const result = await normalizeMediaForGemini(buffer, mimeType);
            buffer = result.buffer;
            mimeType = result.mimeType;
            console.log(`[server] Converted ${file.originalname} -> ${mimeType}`);
          }

          return {
            inlineData: {
              data: buffer.toString("base64"),
              mimeType,
            },
          };
        })
      );

      const result = await estimateHandymanTask(taskId, params, media);

      res.json({ success: true, result });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Estimation error:", message);
      res.status(500).json({ success: false, error: message });
    }
  }
);

// ─── Multer error handler (file too large, bad MIME type, etc.) ──────────────

app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message ?? "Unknown upload error" });
  }
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", taskCount: TASK_REGISTRY.length });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Handyman Estimator API running on port ${PORT}`);
  console.log(`   ${TASK_REGISTRY.length} tasks registered`);
  console.log(`   GET  /tasks     → task registry for frontend`);
  console.log(`   POST /estimate  → run estimation (accepts images + videos, incl. HEIC/MOV)`);
});