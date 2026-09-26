import { LegacyTargetAdapter, type TargetAdapter } from "./legacyAdapter";

export interface TargetSelection {
  baseUrl: string;
  target?: string;
  adapter?: string;
  legacyPort: number;
}

export function selectTarget(options: TargetSelection): { targetUrl: string; targetAdapter?: TargetAdapter } {
  const targetUrl = options.target ?? options.baseUrl;
  const localUrl = `http://localhost:${options.legacyPort}`;
  const isLocalRecordingTarget = targetUrl.replace(/\/+$/, "") === localUrl;
  if (!options.adapter) {
    // Preserve the local no-flag workflow, but only when the resolved URL is
    // the compose Legacy service. An environment override can select Next.
    return {
      targetUrl,
      targetAdapter: options.target === undefined && isLocalRecordingTarget
        ? new LegacyTargetAdapter()
        : undefined,
    };
  }
  if (options.adapter !== "legacy") throw new Error(`Unknown target adapter: ${options.adapter}`);

  if (!isLocalRecordingTarget) {
    throw new Error(`Legacy adapter requires the local recording target ${localUrl}; got ${targetUrl}`);
  }
  return { targetUrl, targetAdapter: new LegacyTargetAdapter() };
}
