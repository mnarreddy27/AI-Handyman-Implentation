/**
 * server.ts
 *
 * Express API server exposing the handyman estimator to your frontend.
 *
 * POST /estimate
 *   Body (multipart/form-data):
 *     - taskId: string (required) — one of the IDs from taskRegistry.ts
 *     - params: JSON string of user-provided parameter values
 *     - photos: one or more image files (optional, any count)
 *
 * GET /tasks
 *   Returns the full task registry (id, label, category, params) for the frontend to render forms.
 */

import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import { estimateHandymanTask } from "./orchestration";
import { TASK_REGISTRY, getTasksByCategory } from "./taskRegistry";
import { PhotoInput } from "./imageAnalysis";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

// Accept multiple files under the field name "photos"
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per file
});

app.use(cors());
app.use(express.json());

// ─── GET /tasks ───────────────────────────────────────────────────────────────
// Returns the task registry for the frontend to build dynamic forms.

app.get("/tasks", (_req, res) => {
  res.json({
    tasks: TASK_REGISTRY.map(({ id, label, category, params }) => ({
      id,
      label,
      category,
      params,
    })),
    byCategory: Object.fromEntries(
      Object.entries(getTasksByCategory()).map(([cat, tasks]) => [
        cat,
        tasks.map(({ id, label }) => ({ id, label })),
      ])
    ),
  });
});

// ─── POST /estimate ───────────────────────────────────────────────────────────
// Main estimation endpoint — accepts any task + any number of photos.

app.post(
  "/estimate",
  upload.array("photos"),           // "photos" is the field name in FormData
  async (req, res) => {
    try {
      // 1. Task ID
      const taskId = req.body.taskId as string;
      if (!taskId) {
        return res.status(400).json({ success: false, error: "taskId is required" });
      }

      // 2. User params
      let params: Record<string, unknown> = {};
      if (req.body.params) {
        try {
          params = JSON.parse(req.body.params);
        } catch {
          return res.status(400).json({ success: false, error: "params must be valid JSON" });
        }
      }

      // 3. Photos (0 to N)
      const files = req.files as Express.Multer.File[] | undefined;
      const photos: PhotoInput[] = (files ?? []).map((file) => ({
        base64: file.buffer.toString("base64"),
        mediaType: (file.mimetype as PhotoInput["mediaType"]) ?? "image/jpeg",
      }));

      // 4. Run estimation
      const result = await estimateHandymanTask(taskId, params, photos);

      res.json({ success: true, result });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Estimation error:", message);
      res.status(500).json({ success: false, error: message });
    }
  }
);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", taskCount: TASK_REGISTRY.length });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Handyman Estimator API running on port ${PORT}`);
  console.log(`   ${TASK_REGISTRY.length} tasks registered`);
  console.log(`   GET  /tasks     → task registry for frontend`);
  console.log(`   POST /estimate  → run estimation`);
});