export type ComputerAction =
  | {
      type: "click" | "double_click";
      x: number;
      y: number;
      button?: "left" | "right" | "wheel" | "back" | "forward";
      keys?: string[];
    }
  | {
      type: "move";
      x: number;
      y: number;
      keys?: string[];
    }
  | {
      type: "scroll";
      x: number;
      y: number;
      scrollX?: number;
      scrollY?: number;
      scroll_x?: number;
      scroll_y?: number;
      keys?: string[];
    }
  | {
      type: "type";
      text: string;
    }
  | {
      type: "keypress";
      keys: string[];
    }
  | {
      type: "drag";
      path: Array<{ x: number; y: number }>;
      keys?: string[];
    }
  | {
      type: "wait" | "screenshot";
    };

export type ComputerRunState =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type ComputerRunStatus = {
  taskId: string;
  goal: string;
  state: ComputerRunState;
  phase: string;
  step: number;
  liveViewUrl?: string;
  resultSummary?: string;
  recordingPath?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  heartbeatAt?: number;
  lastAction?: string;
};

export type ComputerRunEvent = {
  sequence: number;
  step: number;
  actionType: ComputerAction["type"];
  label: string;
  x?: number;
  y?: number;
  detail?: string;
  createdAt: number;
};

export type ComputerViewerSnapshot = {
  run: ComputerRunStatus;
  streamUrl: string;
  events: ComputerRunEvent[];
};
