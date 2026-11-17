import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/db/server";
import { isSupabaseConfigured } from "@/lib/env";

export async function POST(request: NextRequest) {
  if (isSupabaseConfigured()) {
    const db = await createSessionClient();
    await db.auth.signOut();
  }
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
}
