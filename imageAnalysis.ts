import { GoogleGenAI, Type } from "@google/genai";
import { ImageAnalysisResult, TVInstallParams } from "./types";

const ai = new GoogleGenAI({});

const WALL_MATERIALS = [
  "drywall",
  "brick",
  "concrete",
  "tile",
  "plaster",
  "unknown",
] as const;

const MOUNT_TYPES = ["fixed", "tilting", "full_motion"] as const;

const WIRE_CONCEALMENT = ["none", "external_track", "in_wall"] as const;

const OUTLET_POSITIONS = ["behind_tv_area", "nearby", "far", "unknown"] as const;

/** Strict Gemini schema aligned 1:1 with ImageAnalysisResult. */
const IMAGE_ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    wallType: {
      type: Type.STRING,
      enum: [...WALL_MATERIALS],
      description: "Primary wall surface material visible at the mount location.",
    },
    outletVisible: {
      type: Type.BOOLEAN,
      description: "Whether a power outlet is visible in the photo.",
    },
    outletPosition: {
      type: Type.STRING,
      enum: [...OUTLET_POSITIONS],
      description: "Relative position of the nearest visible outlet to the TV area.",
    },
    obstaclesDetected: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Physical obstacles that may complicate installation.",
    },
    existingMount: {
      type: Type.BOOLEAN,
      description: "Whether an existing TV mount bracket is already on the wall.",
    },
    aboveFireplace: {
      type: Type.BOOLEAN,
      description: "Whether the mount location appears to be above a fireplace.",
    },
    estimatedMountHeight: {
      type: Type.INTEGER,
      nullable: true,
      description: "Estimated mount center height in inches from the floor, or null if unclear.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Overall confidence score from 0.0 to 1.0.",
    },
    parameterOverrides: {
      type: Type.OBJECT,
      properties: {
        tvWidth: { type: Type.NUMBER },
        tvHeight: { type: Type.NUMBER },
        tvDepth: { type: Type.NUMBER },
        tvDiagonal: { type: Type.NUMBER },
        wallMaterial: { type: Type.STRING, enum: [...WALL_MATERIALS] },
        mountType: { type: Type.STRING, enum: [...MOUNT_TYPES] },
        mountHeight: { type: Type.NUMBER },
        aboveFireplace: { type: Type.BOOLEAN },
        wireConcealment: { type: Type.STRING, enum: [...WIRE_CONCEALMENT] },
      },
      propertyOrdering: [
        "tvWidth",
        "tvHeight",
        "tvDepth",
        "tvDiagonal",
        "wallMaterial",
        "mountType",
        "mountHeight",
        "aboveFireplace",
        "wireConcealment",
      ],
      description: "Only populate fields you can infer from the image; leave others absent.",
    },
    validationFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Warnings or validation notes for the installer.",
    },
  },
  required: [
    "wallType",
    "outletVisible",
    "outletPosition",
    "obstaclesDetected",
    "existingMount",
    "aboveFireplace",
    "estimatedMountHeight",
    "confidence",
    "parameterOverrides",
    "validationFlags",
  ],
  propertyOrdering: [
    "wallType",
    "outletVisible",
    "outletPosition",
    "obstaclesDetected",
    "existingMount",
    "aboveFireplace",
    "estimatedMountHeight",
    "confidence",
    "parameterOverrides",
    "validationFlags",
  ],
};

function stripBase64Prefix(base64Image: string): string {
  const dataUrlMatch = base64Image.match(/^data:[^;]+;base64,(.+)$/);
  return dataUrlMatch ? dataUrlMatch[1] : base64Image;
}

function buildAnalysisPrompt(userParams: Partial<TVInstallParams>): string {
  return `You are an expert TV installation estimator analyzing a photo of an installation site.
Analyze this image and populate the JSON schema with your visual findings.

Use the user-provided values below as context, but still report what you actually see in the photo.
Only include fields inside parameterOverrides when you can infer them from the image.

User stated wall type: ${userParams.wallMaterial ?? "not specified"}
User stated mount height (inches): ${userParams.mountHeight ?? "not specified"}
User stated above fireplace: ${userParams.aboveFireplace ?? "not specified"}
User stated TV diagonal (inches): ${userParams.tvDiagonal ?? "not specified"}
User stated mount type: ${userParams.mountType ?? "not specified"}
User stated wire concealment: ${userParams.wireConcealment ?? "not specified"}`;
}

export async function analyzeInstallImage(
  base64Image: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
  userParams: Partial<TVInstallParams> = {}
): Promise<ImageAnalysisResult> {
  const prompt = buildAnalysisPrompt(userParams);
  const imageData = stripBase64Prefix(base64Image);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      { text: prompt },
      { inlineData: { data: imageData, mimeType: mediaType } },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: IMAGE_ANALYSIS_RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty response for image analysis.");
  }

  const parsed = JSON.parse(response.text) as ImageAnalysisResult;

  return {
    ...parsed,
    confidence: Math.min(1, Math.max(0, parsed.confidence)),
    parameterOverrides: parsed.parameterOverrides ?? {},
    validationFlags: parsed.validationFlags ?? [],
    obstaclesDetected: parsed.obstaclesDetected ?? [],
  };
}
