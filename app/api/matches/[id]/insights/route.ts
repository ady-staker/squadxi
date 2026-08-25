import { NextResponse } from "next/server";
import { getMatchInsights } from "@/lib/match-insights";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const insights = await getMatchInsights(params.id);
  if (!insights) {
    return NextResponse.json(
      { error: "Insights aren't available for this match." },
      { status: 404 },
    );
  }
  return NextResponse.json(insights);
}
