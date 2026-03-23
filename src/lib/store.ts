/**
 * 本地存储数据层
 * 存储播客记录和通话记录，供各页面共享使用
 */
import { useState, useEffect } from "react";

export type PodcastRecord = {
  id: string;
  type: "podcast";
  title: string;
  duration: string;
  date: string;
  language: string;
  materials: number;
  audioUrl?: string;
};

export type CallRecord = {
  id: string;
  type: "call";
  title: string;
  duration: string;
  date: string;
  stage: number;
  stageName: string;
  status: "completed" | "interrupted" | "generating";
};

export type HistoryRecord = PodcastRecord | CallRecord;

const PODCASTS_KEY = "podcraft-podcasts";
const CALLS_KEY = "podcraft-calls";

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // storage quota exceeded or unavailable
  }
}

/** Hook for podcast records (completed podcasts) */
export function usePodcastStore() {
  const [podcasts, setPodcasts] = useState<PodcastRecord[]>(() =>
    loadFromStorage<PodcastRecord[]>(PODCASTS_KEY, [])
  );

  const addPodcast = (record: Omit<PodcastRecord, "id" | "type">) => {
    const newRecord: PodcastRecord = {
      ...record,
      id: Date.now().toString(),
      type: "podcast",
    };
    setPodcasts((prev) => {
      const updated = [newRecord, ...prev];
      saveToStorage(PODCASTS_KEY, updated);
      return updated;
    });
    return newRecord.id;
  };

  const deletePodcast = (id: string) => {
    setPodcasts((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      saveToStorage(PODCASTS_KEY, updated);
      return updated;
    });
  };

  return { podcasts, addPodcast, deletePodcast };
}

/** Hook for call/session records */
export function useCallStore() {
  const [calls, setCalls] = useState<CallRecord[]>(() =>
    loadFromStorage<CallRecord[]>(CALLS_KEY, [])
  );

  const addCall = (record: Omit<CallRecord, "id" | "type">) => {
    const newRecord: CallRecord = {
      ...record,
      id: Date.now().toString(),
      type: "call",
    };
    setCalls((prev) => {
      const updated = [newRecord, ...prev];
      saveToStorage(CALLS_KEY, updated);
      return updated;
    });
    return newRecord.id;
  };

  const updateCall = (id: string, patch: Partial<CallRecord>) => {
    setCalls((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
      saveToStorage(CALLS_KEY, updated);
      return updated;
    });
  };

  const deleteCall = (id: string) => {
    setCalls((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      saveToStorage(CALLS_KEY, updated);
      return updated;
    });
  };

  return { calls, addCall, updateCall, deleteCall };
}

/** Combined hook for history page */
export function useHistoryStore() {
  const { podcasts, deletePodcast } = usePodcastStore();
  const { calls, deleteCall } = useCallStore();

  const all: HistoryRecord[] = [...podcasts, ...calls].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const deleteRecord = (record: HistoryRecord) => {
    if (record.type === "podcast") deletePodcast(record.id);
    else deleteCall(record.id);
  };

  return { all, podcasts, calls, deleteRecord };
}
