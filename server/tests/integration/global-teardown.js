const path = require("path");
const os = require("os");
const fs = require("fs");
const { execSync } = require("child_process");

const STATE_FILE = path.join(os.tmpdir(), "worksetu-test-server-state.json");

module.exports = async function globalTeardown() {
  if (!fs.existsSync(STATE_FILE)) return;
  const { pid } = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // Already exited — nothing to clean up.
  }
  fs.unlinkSync(STATE_FILE);
};
