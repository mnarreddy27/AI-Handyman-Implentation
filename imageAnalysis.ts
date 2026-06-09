// imageAnalysis.ts
//Image Analysis Model
import { GoogleGenAI, Type } from "@google/genai";
import { TVInstallParams, ImageAnalysisResult } from "./types";

const ai = new GoogleGenAI({});

export async function analyzeInstallImage(
  base64Image: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  userParams: Partial<TVInstallParams>
): Promise<ImageAnalysisResult> {
  
  const prompt = `You are an expert TV installation estimator analyzing a photo of an installation site.
Analyze this image and populate the requested JSON schema.

User stated wall type is: ${userParams.wallMaterial ?? "not specified"}
User stated mount height: ${userParams.mountHeight ?? "not specified"}
User stated above fireplace: ${userParams.aboveFireplace ?? "not specified"}`;

  const imagePart = {
    inlineData: { data: base64Image, mimeType: mediaType }
  };

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [prompt, imagePart],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          wallType: { type: Type.STRING, enum: ["drywall", "brick", "concrete", "tile", "plaster", "unknown"] },
          outletVisible: { type: Type.BOOLEAN },
          outletPosition: { type: Type.STRING, enum: ["behind_tv_area", "nearby", "far", "unknown"] },
          obstaclesDetected: { type: Type.ARRAY, items: { type: Type.STRING } },
          existingMount: { type: Type.BOOLEAN },
          aboveFireplace: { type: Type.BOOLEAN },
          estimatedMountHeight: { type: Type.INTEGER, nullable: true },
          confidence: { type: Type.NUMBER },
          parameterOverrides: { type: Type.OBJECT },
          validationFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          "wallType", "outletVisible", "outletPosition", "obstaclesDetected", 
          "existingMount", "aboveFireplace", "estimatedMountHeight", 
          "confidence", "parameterOverrides", "validationFlags"
        ],
      }
    }
  });

  if (!response.text) throw new Error("Failed to receive response from Gemini.");
  return JSON.parse(response.text) as ImageAnalysisResult;
}
