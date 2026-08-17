import { NextRequest, NextResponse } from "next/server";

export const GET = (request: NextRequest, res: NextResponse) => {
  return NextResponse.json(
    { status: "ok" },
    {
      status: 200
    }
  );
};
