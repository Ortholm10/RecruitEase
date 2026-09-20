/**
 * Minimal ambient types for @timadey/proctor (v1.2.6 ships no .d.ts).
 * Declares only the surface hooks/use-gaze-tracking.ts actually touches —
 * not the library's full API.
 */
declare module "@timadey/proctor" {
  /** One event as handed to onEvent. Gaze events carry direction/duration;
   *  every event also carries extractedFeatures (face/hand landmark data) which
   *  we deliberately never read or forward. */
  export interface ProctorEvent {
    event: string;
    lv?: number;
    ts?: number;
    direction?: string;
    duration?: number;
    severity?: string;
    [key: string]: unknown;
  }

  export interface ProctorOptions {
    enableVisualDetection?: boolean;
    enableAudioMonitoring?: boolean;
    enablePatternDetection?: boolean;
    enableBrowserTelemetry?: boolean;
    detectionFPS?: number;
    prolongedGazeAwayDuration?: number;
    onEvent?: (event: ProctorEvent) => void;
    onError?: (error: unknown) => void;
  }

  export class ProctoringEngine {
    /** Static singleton slot. destroy() does NOT clear it, so callers that want
     *  a usable engine after teardown must null it themselves. */
    static instance: ProctoringEngine | null;
    static getInstance(options?: ProctorOptions): ProctoringEngine;
    initialize(): Promise<void>;
    start(video: HTMLVideoElement): void;
    stop(): void;
    destroy(): void;
  }
}
