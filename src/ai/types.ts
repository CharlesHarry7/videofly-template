// AI Video Provider Types

export type ProviderType = "evolink" | "kie" | "apimart";

// Unified video generation parameters
export interface VideoGenerationParams {
  model?: string;
  prompt: string;
  aspectRatio?: string;
  duration?: number;
  quality?: string;
  imageUrl?: string;
  imageUrls?: string[];
  mode?: string;
  outputNumber?: number;
  generateAudio?: boolean;
  removeWatermark?: boolean;
  callbackUrl?: string;
}

// Unified task response
export interface VideoTaskResponse {
  taskId: string;
  provider: ProviderType;
  status: "pending" | "processing" | "completed" | "failed";
  progress?: number;
  estimatedTime?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: {
    code: string;
    message: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw?: any;
}

// Provider interface
export interface AIVideoProvider {
  name: string;
  supportImageToVideo: boolean;
  createTask(params: VideoGenerationParams): Promise<VideoTaskResponse>;
  getTaskStatus(taskId: string): Promise<VideoTaskResponse>;
  reviewVideo?(input: { videoUrl: string }): Promise<{
    safe: boolean;
    reason: string;
    costCredits?: number | null;
    raw?: unknown;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseCallback(payload: any): VideoTaskResponse;
}
