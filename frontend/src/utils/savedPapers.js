const SAVED_PAPERS_STORAGE_KEY = "techsentry_saved_papers";
const SAVED_PAPERS_EVENT_NAME = "techsentry:saved-papers-updated";

const readSavedPapers = () => {
  try {
    const raw = localStorage.getItem(SAVED_PAPERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeSavedPapers = (items) => {
  localStorage.setItem(SAVED_PAPERS_STORAGE_KEY, JSON.stringify(items));
};

const emitSavedPapersUpdated = () => {
  window.dispatchEvent(new CustomEvent(SAVED_PAPERS_EVENT_NAME));
};

const normalizePaperId = (paperId) => String(paperId || "").trim();

export const getSavedPapers = () => readSavedPapers();

export const getSavedPapersCount = () => readSavedPapers().length;

export const isPaperSaved = (paperId) => {
  const normalizedId = normalizePaperId(paperId);
  if (!normalizedId) return false;
  return readSavedPapers().some(
    (paper) => normalizePaperId(paper.paperId) === normalizedId,
  );
};

export const toggleSavedPaper = (paper) => {
  const normalizedId = normalizePaperId(paper?.paperId);
  if (!normalizedId) {
    return { saved: false, items: readSavedPapers() };
  }

  const current = readSavedPapers();
  const exists = current.some(
    (item) => normalizePaperId(item.paperId) === normalizedId,
  );

  let next;
  let saved;
  if (exists) {
    next = current.filter(
      (item) => normalizePaperId(item.paperId) !== normalizedId,
    );
    saved = false;
  } else {
    next = [{ ...paper, paperId: normalizedId }, ...current];
    saved = true;
  }

  writeSavedPapers(next);
  emitSavedPapersUpdated();
  return { saved, items: next };
};

export const subscribeToSavedPapersUpdates = (callback) => {
  if (typeof callback !== "function") return () => {};

  const handler = () => callback();
  window.addEventListener(SAVED_PAPERS_EVENT_NAME, handler);
  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(SAVED_PAPERS_EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
};
