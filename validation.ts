/**
 * validation.ts
 *
 * Runtime validation for incoming requests.
 * Rather than hand-writing a Zod schema per task (50+ duplicated schemas to maintain),
 * this builds a Zod schema ON THE FLY from each task's ParamDefinition[] in taskRegistry.ts.
 * Add a param to the registry and validation updates automatically — single source of truth.
 */

import { z, ZodError } from "zod";
import { ParamDefinition, TaskDefinition, getTask } from "./taskRegistry";

// ─── Errors ──────────────────────────────────────────────────────────────────

export class ValidationFailedError extends Error {
  public readonly issues: { path: string; message: string }[];

  constructor(issues: { path: string; message: string }[]) {
    super(`Validation failed: ${issues.map(i => `${i.path}: ${i.message}`).join("; ")}`);
    this.name = "ValidationFailedError";
    this.issues = issues;
  }
}

export class UnknownTaskError extends Error {
  constructor(taskId: string) {
    super(`Unknown task ID: "${taskId}"`);
    this.name = "UnknownTaskError";
  }
}

// ─── Schema builder ──────────────────────────────────────────────────────────

/**
 * Converts a single ParamDefinition into the matching Zod type.
 * Image analysis can fill in any field marked `optional`, so those are
 * `.optional()` at the schema level — but required fields must be present
 * and correctly typed if the user does supply them.
 */
function paramToZodType(param: ParamDefinition): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (param.type) {
    case "number":
      schema = z.coerce.number({
        invalid_type_error: `${param.key} must be a number`,
      }).finite();
      break;

    case "boolean":
      // Accept real booleans or string "true"/"false" (common from form data / multipart)
      schema = z.union([
        z.boolean(),
        z.enum(["true", "false"]).transform(v => v === "true"),
      ]);
      break;

    case "select":
      if (!param.options || param.options.length === 0) {
        schema = z.string();
      } else {
        schema = z.enum(param.options as [string, ...string[]], {
          errorMap: () => ({
            message: `${param.key} must be one of: ${param.options!.join(", ")}`,
          }),
        });
      }
      break;

    case "multiselect":
      if (!param.options || param.options.length === 0) {
        schema = z.array(z.string());
      } else {
        const optionEnum = z.enum(param.options as [string, ...string[]]);
        schema = z.array(optionEnum, {
          invalid_type_error: `${param.key} must be an array of strings`,
        });
      }
      break;

    case "text":
      schema = z.string().max(2000, `${param.key} must be under 2000 characters`);
      break;

    default:
      schema = z.unknown();
  }

  // Every field is optional at the validation layer because:
  //  - fields marked `optional: true` can be filled by image analysis
  //  - fields NOT marked optional are still allowed to arrive blank from the user,
  //    because the orchestrator applies registry defaultValue / safe fallbacks downstream.
  // Validation's job is to reject WRONG TYPES, not to enforce required-ness —
  // that responsibility stays with image inference + defaults in orchestration.ts.
  return schema.optional();
}

const schemaCache = new Map<string, z.ZodObject<any>>();

function buildTaskParamSchema(task: TaskDefinition): z.ZodObject<any> {
  const cached = schemaCache.get(task.id);
  if (cached) return cached;

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const param of task.params) {
    shape[param.key] = paramToZodType(param);
  }

  // Allow unknown extra keys to pass through without failing — forward-compatible
  // if the frontend sends extra metadata fields we don't care about.
  const schema = z.object(shape).passthrough();
  schemaCache.set(task.id, schema);
  return schema;
}

// ─── Public validation functions ──────────────────────────────────────────────

export interface ValidatedRequest {
  taskId: string;
  task: TaskDefinition;
  params: Record<string, unknown>;
}

/**
 * Validates an incoming taskId + raw params object.
 * Throws UnknownTaskError if the task doesn't exist.
 * Throws ValidationFailedError if any param has the wrong type or invalid enum value.
 */
export function validateEstimateRequest(
  taskId: unknown,
  rawParams: unknown
): ValidatedRequest {
  if (typeof taskId !== "string" || taskId.trim() === "") {
    throw new ValidationFailedError([{ path: "taskId", message: "taskId is required and must be a string" }]);
  }

  const task = getTask(taskId);
  if (!task) {
    throw new UnknownTaskError(taskId);
  }

  if (rawParams !== null && typeof rawParams !== "object") {
    throw new ValidationFailedError([{ path: "params", message: "params must be a JSON object" }]);
  }

  const schema = buildTaskParamSchema(task);
  const result = schema.safeParse(rawParams ?? {});

  if (!result.success) {
    const issues = formatZodIssues(result.error);
    throw new ValidationFailedError(issues);
  }

  return {
    taskId: task.id,
    task,
    params: result.data,
  };
}

function formatZodIssues(error: ZodError): { path: string; message: string }[] {
  return error.issues.map(issue => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

// ─── Photo validation ──────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_PHOTOS_PER_REQUEST = 15;

export interface RawUploadedPhoto {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

/**
 * Validates uploaded photo files before they're ever sent to Gemini.
 * Catches: wrong MIME type, oversized files, empty files, too many files.
 */
export function validatePhotos(files: RawUploadedPhoto[]): {
  valid: RawUploadedPhoto[];
  rejected: { filename: string; reason: string }[];
} {
  if (files.length > MAX_PHOTOS_PER_REQUEST) {
    throw new ValidationFailedError([{
      path: "photos",
      message: `Maximum ${MAX_PHOTOS_PER_REQUEST} photos per request (received ${files.length})`,
    }]);
  }

  const valid: RawUploadedPhoto[] = [];
  const rejected: { filename: string; reason: string }[] = [];

  for (const file of files) {
    const name = file.originalname ?? "unnamed";

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      rejected.push({ filename: name, reason: `Unsupported file type: ${file.mimetype}. Use JPEG, PNG, or WebP.` });
      continue;
    }

    if (file.size === 0) {
      rejected.push({ filename: name, reason: "File is empty" });
      continue;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      rejected.push({ filename: name, reason: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max 20MB)` });
      continue;
    }

    valid.push(file);
  }

  return { valid, rejected };
}