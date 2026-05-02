import axios from "axios";
import config from "../config";

// valid values as per the spec
export type Stack = "backend" | "frontend";
export type Level = "debug" | "info" | "warn" | "error" | "fatal";
export type Package =
  | "cache" | "controller" | "cron_job" | "db" | "domain"
  | "handler" | "repository" | "route" | "service"   // backend only
  | "api" | "component" | "hook" | "page" | "state" | "style"  // frontend only
  | "auth" | "config" | "middleware" | "utils";       // shared

let _token: string = config.authToken;

export function setToken(token: string) {
  _token = token;
}

export function getToken(): string {
  return _token;
}

// refreshes the auth token using clientID + clientSecret
export async function refreshToken(): Promise<string> {
  const res = await axios.post(`${config.baseUrl}/auth`, {
    email: config.email,
    name: config.name,
    rollNo: config.rollNo,
    accessCode: config.accessCode,
    clientID: config.clientId,
    clientSecret: config.clientSecret,
  });
  _token = res.data.access_token;
  return _token;
}

/**
 * Log - sends a structured log to the AffordMed test server
 *
 * @param stack   "backend" | "frontend"
 * @param level   "debug" | "info" | "warn" | "error" | "fatal"
 * @param pkg     package name (see spec for allowed values per stack)
 * @param message descriptive message about what is happening
 *
 * examples:
 *   Log("backend", "error", "handler", "received string, expected bool")
 *   Log("backend", "fatal", "db", "Critical database connection failure.")
 *   Log("backend", "info", "service", "Fetched 12 notifications for student 42")
 */
export async function Log(
  stack: Stack,
  level: Level,
  pkg: Package,
  message: string
): Promise<void> {
  // if no token yet, try to get one
  if (!_token) {
    try {
      await refreshToken();
    } catch {
      console.error("[Logger] No token available, cannot send log");
      return;
    }
  }

  const payload = { stack, level, package: pkg, message };

  try {
    await axios.post(`${config.baseUrl}/logs`, payload, {
      headers: { Authorization: `Bearer ${_token}` },
    });

    // also echo to console so you can see logs locally
    const icons: Record<Level, string> = {
      debug: "🔍", info: "ℹ️ ", warn: "⚠️ ", error: "❌", fatal: "💀",
    };
    console.log(`${icons[level]} [${stack}][${pkg}] ${message}`);
  } catch (err: any) {
    // if token expired, refresh once and retry
    if (err?.response?.status === 401) {
      try {
        await refreshToken();
        await axios.post(`${config.baseUrl}/logs`, payload, {
          headers: { Authorization: `Bearer ${_token}` },
        });
      } catch (retryErr: any) {
        console.error("[Logger] Failed after token refresh:", retryErr?.response?.data);
      }
    } else {
      console.error("[Logger] Failed to send log:", err?.response?.data || err.message);
    }
  }
}
