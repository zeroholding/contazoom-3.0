import { NextResponse } from "next/server";
import { generateSessionToken, tryVerifySessionToken, getAuthSecret } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
    const results = {
        envVarPresent: !!process.env.JWT_SECRET,
        envVarLength: process.env.JWT_SECRET?.length,
        secretStart: process.env.JWT_SECRET?.substring(0, 4),
        secretEnd: process.env.JWT_SECRET?.substring((process.env.JWT_SECRET?.length || 0) - 4),
        secretFunctionWorks: false,
        tokenGenerationWorks: false,
        tokenVerificationWorks: false,
        error: null as string | null,
    };

    try {
        // 1. Check Secret
        const secret = getAuthSecret();
        results.secretFunctionWorks = !!secret;

        // 2. Generate Token
        const payload = { userId: "test-user", email: "test@example.com", name: "Test" };
        const token = await generateSessionToken(payload);
        results.tokenGenerationWorks = !!token;

        // 3. Verify Token
        const verified = await tryVerifySessionToken(token);
        results.tokenVerificationWorks = verified?.sub === "test-user";

    } catch (e) {
        results.error = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json(results);
}
