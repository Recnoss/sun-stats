import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(path.join(root, "apps", "frontend"));
await import(pathToFileURL(path.join(root, "node_modules", "vite", "dist", "node", "cli.js")).href);
