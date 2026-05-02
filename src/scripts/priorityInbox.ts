/**
 * Stage 6 - Priority Inbox
 *
 * Fetches notifications from the test server and returns the top N
 * most important ones based on:
 *   - Type weight:  Placement=3, Result=2, Event=1
 *   - Recency:      newer notifications score higher
 *
 * The two scores are combined so that a recent high-priority notification
 * always beats an old low-priority one, but a very old Placement can
 * still beat a very new Event.
 *
 * To keep the top 10 efficient as new notifications arrive, we use a
 * simple min-heap approach - we only keep N items in memory at any time
 * and discard anything that can't beat the current minimum score.
 */

import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

import config from "../config";
import { Log, refreshToken, setToken } from "../middleware/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

type NotificationType = "Placement" | "Result" | "Event";

interface RawNotification {
  ID: string;
  Type: NotificationType;
  Message: string;
  Timestamp: string;
}

interface ScoredNotification extends RawNotification {
  score: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

// weight per type - placement matters most
const TYPE_WEIGHT: Record<NotificationType, number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

// how much recency contributes relative to weight
// with this factor a 1-hour-old Placement still beats a brand-new Event
const RECENCY_SCALE = 0.0001; // per-second multiplier

// ── Scoring ───────────────────────────────────────────────────────────────────

function score(n: RawNotification): number {
  const weight = TYPE_WEIGHT[n.Type] ?? 1;
  const ageSeconds = (Date.now() - new Date(n.Timestamp).getTime()) / 1000;
  // higher weight + more recent = higher score
  return weight + 1 / (1 + ageSeconds * RECENCY_SCALE);
}

// ── Min-heap helpers (keeps top N without sorting everything) ─────────────────

function heapPush(heap: ScoredNotification[], item: ScoredNotification) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = Math.floor((i - 1) / 2);
    if (heap[parent].score <= heap[i].score) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

function heapPop(heap: ScoredNotification[]): ScoredNotification | undefined {
  if (heap.length === 0) return undefined;
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < heap.length && heap[l].score < heap[smallest].score) smallest = l;
      if (r < heap.length && heap[r].score < heap[smallest].score) smallest = r;
      if (smallest === i) break;
      [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
      i = smallest;
    }
  }
  return top;
}

/**
 * getTopN - returns the top N notifications by priority score
 *
 * Uses a fixed-size min-heap so we never hold more than N+1 items in memory.
 * This works correctly even when new notifications keep arriving because:
 *   - if incoming score > heap minimum, evict the minimum and insert new one
 *   - otherwise discard the incoming one immediately
 *
 * Time complexity: O(k log N) where k = total notifications
 * Space complexity: O(N)
 */
function getTopN(notifications: RawNotification[], n: number): ScoredNotification[] {
  const heap: ScoredNotification[] = [];

  for (const notif of notifications) {
    const scored: ScoredNotification = { ...notif, score: score(notif) };

    if (heap.length < n) {
      heapPush(heap, scored);
    } else if (heap[0] && scored.score > heap[0].score) {
      heapPop(heap);
      heapPush(heap, scored);
    }
    // if scored.score <= heap minimum, discard - it doesn't make the cut
  }

  // extract from heap and sort descending for display
  const result: ScoredNotification[] = [];
  while (heap.length > 0) {
    const item = heapPop(heap);
    if (item) result.push(item);
  }
  return result.sort((a, b) => b.score - a.score);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(topN: number = 10) {
  // get auth token first
  await Log("backend", "info", "service", `Priority inbox: top ${topN}`);

  let token = config.authToken;
  if (!token) {
    await Log("backend", "warn", "auth", "No token in env, attempting to fetch one");
    token = await refreshToken();
    setToken(token);
  }

  await Log("backend", "info", "route", "Calling GET /evaluation-service/notifications");

  let notifications: RawNotification[] = [];

  try {
    const res = await axios.get(`${config.baseUrl}/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    notifications = res.data.notifications;
    await Log("backend", "info", "service", `Fetched ${notifications.length} notifications from server`);
  } catch (err: any) {
    await Log("backend", "error", "handler", `Failed to fetch notifications: ${err?.response?.data?.message || err.message}`);
    console.error("Could not fetch notifications:", err?.response?.data || err.message);
    return;
  }

  if (!notifications || notifications.length === 0) {
    await Log("backend", "warn", "service", "No notifications returned from server");
    console.log("No notifications found.");
    return;
  }

  await Log("backend", "debug", "service", `Scoring ${notifications.length} notifications`);

  const topNotifications = getTopN(notifications, topN);

  await Log("backend", "info", "service", `Top ${topN} notifications computed`);

  // print results
  console.log(`\n===== TOP ${topN} PRIORITY NOTIFICATIONS =====\n`);
  topNotifications.forEach((n, i) => {
    console.log(`#${i + 1} [${n.Type}] ${n.Message}`);
    console.log(`     ID: ${n.ID}`);
    console.log(`     Timestamp: ${n.Timestamp}`);
    console.log(`     Score: ${n.score.toFixed(4)}`);
    console.log();
  });

  return topNotifications;
}

// run it - change the number to get top 15, top 20, etc.
main(10);
