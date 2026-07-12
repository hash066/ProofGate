import { resolve } from "node:path";

export function convexCliInvocation(
  projectRoot: string,
  functionName: string,
  args: unknown,
): { executable: string; args: string[] } {
  return {
    executable: process.execPath,
    args: [
      resolve(projectRoot, "node_modules/convex/bin/main.js"),
      "run",
      functionName,
      JSON.stringify(args),
    ],
  };
}
