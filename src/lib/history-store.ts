/**
 * 播客历史记录本地存储层
 * 已完成的播客保存在 localStorage，无需依赖后端数据库
 */

import type { PodcastHistoryItem } from "./api";

const HISTORY_KEY = "podcraft_history";

export function getStoredHistory(): PodcastHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToHistory(item: PodcastHistoryItem): void {
  const existing = getStoredHistory().filter(i => i.id !== item.id);
  existing.unshift(item); // 最新在前
  localStorage.setItem(HISTORY_KEY, JSON.stringify(existing));
}

export function removeFromHistory(id: string): void {
  const items = getStoredHistory().filter(i => i.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

export function getStoredItem(id: string): PodcastHistoryItem | null {
  return getStoredHistory().find(i => i.id === id) ?? null;
}

/** 迁移：将后端返回的已完成列表写入本地（仅首次，避免重复） */
export function migrateFromBackend(items: PodcastHistoryItem[]): void {
  const existing = getStoredHistory();
  if (existing.length > 0) return; // 已有本地数据，跳过
  const completed = items.filter(i => i.status !== "generating");
  if (completed.length > 0) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(completed));
  }
}
