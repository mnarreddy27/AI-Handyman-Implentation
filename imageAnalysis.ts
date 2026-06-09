// imageAnalysis.ts
//Image Analysis Model
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface ImageAnalysisResult {
  wallType: "drywall" | "brick" | "concrete" | "tile" | "plaster" | "unknown";
  outletVisible: boolean;
  outletPosition: "behind_tv_area" | "nearby" | "far" | "unknown";
  obstaclesDetected: string[];       // e.g. ["fireplace", "crown_molding"]
  existingMount: boolean;
  aboveFireplace: boolean;
  estimatedMountHeight: number | null; // inches from floor, if inferrable
  confidence: number;                // 0–1
  parameterOverrides: Partial<TVInstallParams>; // fields image can replace
  validationFlags: string[];         // conflicts with user-provided params
}

export async function analyzeInstallImage(
  base64Image: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  userParams: Partial<TVInstallParams>
): Promise<ImageAnalysisResult> {
  
  const prompt = `You are an expert TV installation estimator analyzing a photo of an installation site.

Analyze this image and return a JSON object with ONLY these fields:
{
  "wallType": "drywall" | "brick" | "concrete" | "tile" | "plaster" | "unknown",
  "outletVisible": boolean,
  "outletPosition": "behind_tv_area" | "nearby" | "far" | "unknown",
  "obstaclesDetected": string[],  // e.g. ["fireplace", "crown_molding", "built_in_shelving"]
  "existingMount": boolean,
  "aboveFireplace": boolean,
  "estimatedMountHeight": number | null,  // approximate inches from floor
  "confidence": number,  // 0.0 to 1.0
  "parameterOverrides": {},  // params you can confidently infer
  "validationFlags": []  // list any conflicts with these user-provided params: ${JSON.stringify(userParams)}
}

User said wall type is: ${userParams.wallMaterial ?? "not specified"}
User said mount height: ${userParams.mountHeight ?? "not specified"}
User said above fireplace: ${userParams.aboveFireplace ?? "not specified"}

Return ONLY valid JSON, no explanation.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Image }
          },
          { type: "text", text: prompt }
        ]
      }
    ]
  });

  const text = response.content
    .filter(b => b.type === "text")
    .map(b => (b as any).text)
    .join("");

  return JSON.parse(text.replace(/```json|```/g, "").trim()) as ImageAnalysisResult;
}
