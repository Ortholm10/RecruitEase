import type { Metadata } from "next";
import { InterviewRoom } from "@/components/interview/interview-room";

export const metadata: Metadata = {
  title: "RecruitEase — take your interview",
};

// Do not statically shell-prerender a candidate interview URL: the room is a
// per-request session (email gate → consent → live plan). Opt out of the
// cacheComponents static-shell validation for this segment.
export const instant = false;

/**
 * Public interview room. No auth required — the room itself resolves access
 * (recruiter session OR candidate email gate) via the API, so this page is a
 * thin static shell. The candidate opens /interview/<id> via the copied link.
 */
export default async function InterviewRoomPage({
  params,
}: {
  params: Promise<{ interviewId: string }>;
}) {
  const { interviewId } = await params;
  return <InterviewRoom interviewId={interviewId} />;
}