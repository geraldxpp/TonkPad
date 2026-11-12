"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_SETTINGS,
  FEED_KEY,
  MAX_RULES,
  readFeed,
  readRules,
  readSettings,
  RULES_KEY,
  SETTINGS_KEY,
  subscribeAlerts,
  writeFeed,
  writeRules,
  writeSettings,
} from "./storage";
import type { AlertRule, AlertSettings, FeedItem } from "./types";

/** Asks the tab that runs the checks to check now (a rule was just added). */
export const CHECK_NOW = "tonkpad-alerts-check";

/** One parsed value per raw localStorage string, so React sees the same object until it changes. */
function cached<T>(key: string, read: () => T, fallback: T) {
  let raw: string | null | undefined;
  let value = fallback;
  return () => {
    let next: string | null = null;
    try {
      next = localStorage.getItem(key);
    } catch {
      return fallback;
    }
    if (next !== raw) {
      raw = next;
      value = read();
    }
    return value;
  };
}

const EMPTY_RULES: AlertRule[] = [];
const EMPTY_FEED: FeedItem[] = [];
const rulesSnapshot = cached(RULES_KEY, readRules, EMPTY_RULES);
const feedSnapshot = cached(FEED_KEY, readFeed, EMPTY_FEED);
const settingsSnapshot = cached(SETTINGS_KEY, readSettings, DEFAULT_SETTINGS);

export const useAlertRules = () => useSyncExternalStore(subscribeAlerts, rulesSnapshot, () => EMPTY_RULES);
export const useAlertFeed = () => useSyncExternalStore(subscribeAlerts, feedSnapshot, () => EMPTY_FEED);
export const useAlertSettings = () => useSyncExternalStore(subscribeAlerts, settingsSnapshot, () => DEFAULT_SETTINGS);
export const useUnreadAlerts = () =>
  useSyncExternalStore(subscribeAlerts, () => feedSnapshot().filter((item) => !item.read).length, () => 0);

/** Adds a rule, newest first; false when the visitor already has the most there can be. */
export function addRule(rule: AlertRule): boolean {
  const rules = readRules();
  if (rules.length >= MAX_RULES) return false;
  writeRules([rule, ...rules]);
  window.dispatchEvent(new Event(CHECK_NOW));
  return true;
}

export const removeRule = (id: string) => writeRules(readRules().filter((rule) => rule.id !== id));
export const setRuleOn = (id: string, on: boolean) => writeRules(readRules().map((rule) => (rule.id === id ? { ...rule, on } : rule)));

export function markAllRead(): void {
  const feed = readFeed();
  if (feed.some((item) => !item.read)) writeFeed(feed.map((item) => ({ ...item, read: true })));
}

export const clearFeed = () => writeFeed([]);

export function updateSettings(patch: Partial<AlertSettings>): void {
  writeSettings({ ...readSettings(), ...patch });
  if (patch.launches || patch.graduations || patch.locks) window.dispatchEvent(new Event(CHECK_NOW));
}

