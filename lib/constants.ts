export const PROVIDER_COLORS: Record<string, string> = {
    "google-gemini": "#3b82f6", // Blue
    openai: "#a855f7", // Purple
    anthropic: "#f97316", // Orange
    "lm-studio": "#ef4444", // Red
    nvidia: "#76b900", // Green
};

export const PROVIDER_INITIALS: Record<string, string> = {
    "google-gemini": "M",
    openai: "A",
    anthropic: "C",
    "lm-studio": "L",
    nvidia: "N",
};

// Threshold zoom level where provider error circles automatically appear
export const AUTO_CIRCLES_ZOOM_THRESHOLD = 13;