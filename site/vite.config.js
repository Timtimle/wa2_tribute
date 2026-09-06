import { defineConfig } from "vite";
import { sites } from "@openai/sites-vite-plugin";
import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { resolve } from "node:path";

function emitStaticWorker() {
  return {
    name: "emit-static-worker",
    closeBundle() {
      const publicAudioDirectory = resolve("dist/client/audio");
      const workerAudioDirectory = resolve("dist/client/_audio");
      if (existsSync(publicAudioDirectory)) renameSync(publicAudioDirectory, workerAudioDirectory);

      const outputDirectory = resolve("dist/server");
      mkdirSync(outputDirectory, { recursive: true });
      copyFileSync(resolve("worker.js"), resolve(outputDirectory, "index.js"));
    },
  };
}

export default defineConfig({
  plugins: [sites(), emitStaticWorker()],
  build: {
    outDir: "dist/client",
    target: "es2020",
  },
});
