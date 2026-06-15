import { orchestrateTVInstallEstimate } from './orchestration';
import * as fs from 'fs';
import * as path from 'path';

// 💡 Universal helper to load an image from either a URL or a Local File
async function loadImageAsBase64(inputPath: string): Promise<string> {
    // Check if the path is a web link
    if (inputPath.startsWith('http://') || inputPath.startsWith('https://')) {
        console.log(`🔗 Detected web link. Fetching custom image data...`);
        const response = await fetch(inputPath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer).toString('base64');
    } 
    
    // Otherwise, treat it as a local file path
    console.log(`📁 Detected local path. Reading file from disk...`);
    const fullLocalPath = path.isAbsolute(inputPath) ? inputPath : path.join(__dirname, inputPath);
    
    if (!fs.existsSync(fullLocalPath)) {
        throw new Error(`Local file not found at: ${fullLocalPath}`);
    }
    
    const imageBuffer = fs.readFileSync(fullLocalPath);
    return imageBuffer.toString('base64');
}

async function runTest() {
    console.log("🚀 Starting flexible TV installation estimation test...");

    // 🌟 CHOOSE EITHER OPTION A OR OPTION B HERE 🌟
    // Option A (Local):  const inputSource = 'sample_wall_2.jpg';
    // Option B (Web):    const inputSource = 'https://images.unsplash.com/photo-1593508512255-86ab42a8e620?w=800';
    const inputSource = 'https://www.tvinstallationone.com/assets/img/blogimg/b10_TV-Above-Fireplace.webp';
    try {
        // Automatically resolves to Base64 regardless of the source type
        const base64ImageString = await loadImageAsBase64(inputSource);

        // 3. Mock incoming user params
        const mockRequest = {
            userParams: {
                tvWidth: 55,
                tvHeight: 32,
                tvDepth: 2.5,
                tvDiagonal: 65,
                wallMaterial: "drywall",
                mountType: "tilting",
                mountHeight: 60,
                aboveFireplace: false,
                wireConcealment: "in_wall"
            } as TVInstallParams // 
        };

        const result = await orchestrateTVInstallEstimate(
            mockRequest.userParams,
            base64ImageString
        );

        console.log("\n✅ Test Execution Successful!");
        console.log("-----------------------------------------");
        console.log(`⏱️  Estimated Duration: ${result.estimatedDurationMinutes} minutes`);
        console.log("📊 Calculation Breakdown:", result.breakdown);
        console.log("🗺️  Reconciled Parameters:", result.reconciledParams);
        console.log("-----------------------------------------");

    } catch (error) {
        console.error("❌ Test failed with error:", error);
    }
}

runTest();