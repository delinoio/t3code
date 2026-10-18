import * as NodeChildProcess from "node:child_process";

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${signal ?? code}.`));
    });
  });
}
