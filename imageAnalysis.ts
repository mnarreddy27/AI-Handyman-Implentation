/**
 * imageAnalysis.ts
 *
 * Analyzes one or more photos for any handyman task using Gemini Vision.
 * Returns observations, parameter inferences, validation flags,
 * and additional complexity detected from the images.
 */

import { GoogleGenAI, Type } from "@google/genai";
import { TaskDefinition, TaskParams } from "./taskRegistry";
import { ImageAnalysisResult } from "./types";

const ai = new GoogleGenAI({});

// ─── Gemini response schema ──────────────────────────────────────────────────

const IMAGE_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    observations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of concrete visual observations relevant to the installation or repair task.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Overall confidence from 0.0 to 1.0 in the image analysis.",
    },
    parameterOverrides: {
      type: Type.OBJECT,
      description:
        "Key-value pairs where keys match the task's parameter keys. " +
        "Only include fields you can confidently infer from the image(s). " +
        "Values should match the expected type (string, number, or boolean).",
      additionalProperties: true,
    },
    validationFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Conflicts between what the image shows and what the user provided. " +
        "Each item is a human-readable note like: " +
        "'User said drywall but image shows brick wall.'",
    },
    additionalComplexityMinutes: {
      type: Type.INTEGER,
      description:
        "Extra minutes to add beyond the standard param-based estimate, " +
        "due to issues visible in the photo that no parameter captures. " +
        "E.g. cluttered work area (+10), water damage requiring treatment (+20). " +
        "Use 0 if no additional complexity is detected.",
    },
    installerNotes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Practical notes for the installer about what they'll encounter on-site. " +
        "Be specific and actionable.",
    },
    inferredTaskType: {
      type: Type.STRING,
      nullable: true,
      description:
        "Only for 'other' tasks: your best description of what the task actually is " +
        "(e.g. 'bathroom tile regrouting', 'exterior light fixture replacement').",
    },
    inferredComplexity: {
      type: Type.STRING,
      enum: ["simple", "moderate", "complex"],
      nullable: true,
      description: "Only for 'other' tasks: inferred complexity level.",
    },
  },
  required: [
    "observations",
    "confidence",
    "parameterOverrides",
    "validationFlags",
    "additionalComplexityMinutes",
    "installerNotes",
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripBase64Prefix(base64: string): string {
  const match = base64.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : base64;
}

function buildPrompt(
  task: TaskDefinition,
  userParams: TaskParams,
  imageCount: number
): string {
  const paramLines = Object.entries(userParams)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
    .join("\n");

  return `You are an expert handyman estimator analyzing ${imageCount > 1 ? `${imageCount} photos` : "a photo"} of a job site.

TASK: ${task.label}
TASK DESCRIPTION: ${task.imageHints}

USER-PROVIDED PARAMETERS:
${paramLines || "  (none provided)"}

INSTRUCTIONS:
1. Analyze the image(s) carefully for details relevant to this specific task.
2. Populate parameterOverrides ONLY for fields you can confidently infer from the image.
   - For the "other" task, infer as much as possible (materials, scope, access, complexity).
   - Parameter keys must exactly match the task's parameter keys listed above.
3. Note any conflicts between what the user stated and what the image shows in validationFlags.
4. Set additionalComplexityMinutes for issues the standard parameters don't capture
   (poor access, unexpected damage, hazardous conditions, site complexity, etc.).
5. Write actionable installerNotes — things the technician should know before arrival.
6. Set confidence between 0.0 (very unclear photo) and 1.0 (crystal clear, high certainty).

Return only valid JSON matching the schema. Be specific and honest — do not guess if the image is unclear.`;
}

// ─── Multi-image analysis ────────────────────────────────────────────────────

export interface PhotoInput {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

export async function analyzeJobPhotos(
  photos: PhotoInput[],
  task: TaskDefinition,
  userParams: TaskParams = {}
): Promise<ImageAnalysisResult> {
  if (photos.length === 0) {
    return {
      observations: [],
      confidence: 0,
      parameterOverrides: {},
      validationFlags: [],
      additionalComplexityMinutes: 0,
      installerNotes: [],
    };
  }

  const prompt = buildPrompt(task, userParams, photos.length);

  // Build the content array: prompt text + all images
  const contents: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: prompt },
    ...photos.map((photo) => ({
      inlineData: {
        data: stripBase64Prefix(photo.base64),
        mimeType: photo.mediaType,
      },
    })),
  ];

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: IMAGE_ANALYSIS_SCHEMA,
      temperature: 0.2,
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty response during image analysis.");
  }

  const parsed = JSON.parse(response.text) as ImageAnalysisResult;

  return {
    observations: parsed.observations ?? [],
    confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
    parameterOverrides: parsed.parameterOverrides ?? {},
    validationFlags: parsed.validationFlags ?? [],
    additionalComplexityMinutes: Math.max(0, parsed.additionalComplexityMinutes ?? 0),
    installerNotes: parsed.installerNotes ?? [],
    inferredTaskType: parsed.inferredTaskType ?? undefined,
    inferredComplexity: parsed.inferredComplexity ?? undefined,
  };
}