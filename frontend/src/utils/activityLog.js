const ACTIVITY_STORAGE_KEY = "techsentry_recent_activity";
const ACTIVITY_EVENT_NAME = "techsentry:activity-updated";
const MAX_ACTIVITY_ITEMS = 50;

const DEFAULT_ACTIVITY_SEED = [
  {
    type: "search",
    description: 'Searched for "Quantum Computing"',
    offsetMs: 2 * 60 * 60 * 1000,
  },
  {
    type: "paper",
    description: "Viewed paper on AI Ethics",
    offsetMs: 4 * 60 * 60 * 1000,
  },
  {
    type: "watchlist",
    description: 'Added "Machine Learning" to watchlist',
    offsetMs: 6 * 60 * 60 * 1000,
  },
  {
    type: "report",
    description: "Generated technology report",
    offsetMs: 24 * 60 * 60 * 1000,
  },
  {
    type: "search",
    description: 'Searched for "Blockchain Technology"',
    offsetMs: 2 * 24 * 60 * 60 * 1000,
  },
];

const clampLimit = (limit) => {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(Math.floor(parsed), MAX_ACTIVITY_ITEMS);
};

const readFromStorage = () => {
  try {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeToStorage = (items) => {
  localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(items));
};

const emitActivityUpdated = () => {
  window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT_NAME));
};

const buildDefaultActivity = () => {
  const now = Date.now();
  return DEFAULT_ACTIVITY_SEED.map((item, index) => ({
    id: `seed-activity-${index + 1}`,
    type: item.type,
    description: item.description,
    createdAt: new Date(now - item.offsetMs).toISOString(),
  }));
};

const mergeWithDefaults = (dynamicItems) => {
  const defaults = buildDefaultActivity();
  const seen = new Set(dynamicItems.map((item) => item.description));
  const missingDefaults = defaults.filter(
    (item) => !seen.has(item.description),
  );
  return [...dynamicItems, ...missingDefaults];
};

const getRelativeTime = (isoDate) => {
  const timestamp = new Date(isoDate).getTime();
  if (Number.isNaN(timestamp)) return "Just now";

  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 60) return "Just now";
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(seconds / 86400);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

export const logActivity = ({ type, description }) => {
  const normalizedDescription = (description || "").trim();
  if (!normalizedDescription) return null;

  const current = readFromStorage();
  const latest = current[0];

  // Avoid repeated duplicate entries when users click rapidly.
  if (latest && latest.description === normalizedDescription) {
    const latestTime = new Date(latest.createdAt).getTime();
    if (!Number.isNaN(latestTime) && Date.now() - latestTime < 10000) {
      return latest;
    }
  }

  const nextItem = {
    id: `activity-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    type: (type || "activity").trim(),
    description: normalizedDescription,
    createdAt: new Date().toISOString(),
  };

  const next = [nextItem, ...current].slice(0, MAX_ACTIVITY_ITEMS);
  writeToStorage(next);
  emitActivityUpdated();
  return nextItem;
};

export const getRecentActivity = (limit = 5) => {
  const safeLimit = clampLimit(limit);
  const merged = mergeWithDefaults(readFromStorage());
  return merged.slice(0, safeLimit).map((item) => ({
    ...item,
    time: getRelativeTime(item.createdAt),
  }));
};

export const subscribeToActivityUpdates = (callback) => {
  if (typeof callback !== "function") return () => {};

  const handler = () => callback();
  window.addEventListener(ACTIVITY_EVENT_NAME, handler);
  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(ACTIVITY_EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
};
