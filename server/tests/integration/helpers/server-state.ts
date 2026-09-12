import path from "path";
import os from "os";
import fs from "fs";

// globalSetup and test files run in separate Jest processes/workers, so
// the spawned server's pid/port are handed off via a state file rather
// than a shared module-level variable.
const STATE_FILE = path.join(os.tmpdir(), "worksetu-test-server-state.json");

export interface ServerState {
  pid: number;
  port: number;
  baseUrl: string;
}

export function writeServerState(state: ServerState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

export function readServerState(): ServerState {
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
}

export function clearServerState(): void {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}
