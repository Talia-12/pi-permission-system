import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { toRecord } from "./common.js";
import type { PermissionSystemExtensionConfig } from "./extension-config.js";

/** pi-automode's read-only inspection tool; its presence means the extension is loaded. */
export const AUTO_MODE_TOOL_NAME = "automode_inspect";

/** Custom session entry pi-automode writes its per-session on/off toggle into. */
export const AUTO_MODE_STATE_ENTRY_TYPE = "pi-automode-state";

export const AUTO_MODE_GLOBAL_CONFIG_PATH = join(
  homedir(),
  ".pi",
  "agent",
  "extensions",
  "pi-automode",
  "config.json",
);

export const AUTO_MODE_PROJECT_CONFIG_FILE = ".pi/automode.local.json";

/** pi-automode enables itself when no configuration says otherwise. */
export const AUTO_MODE_DEFAULT_ENABLED = true;

export interface AutoModeSessionEntrySource {
  getEntries(): unknown[];
}

export function isAutoModeExtensionLoaded(toolNames: readonly (string | null)[]): boolean {
  return toolNames.includes(AUTO_MODE_TOOL_NAME);
}

function readAutoModeEnabledFromFile(path: string): boolean | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    const autoMode = toRecord(toRecord(JSON.parse(readFileSync(path, "utf-8")) as unknown).autoMode);
    return typeof autoMode.enabled === "boolean" ? autoMode.enabled : undefined;
  } catch {
    return undefined;
  }
}

/**
 * pi-automode's configured starting state for a session. Project-local config
 * wins, matching pi-automode's own precedence; the shared project file cannot
 * disable auto mode, so it is not consulted.
 */
export function readAutoModeConfiguredEnabled(
  cwd: string,
  globalConfigPath = AUTO_MODE_GLOBAL_CONFIG_PATH,
): boolean {
  const projectEnabled = readAutoModeEnabledFromFile(resolve(cwd, AUTO_MODE_PROJECT_CONFIG_FILE));
  if (projectEnabled !== undefined) {
    return projectEnabled;
  }

  return readAutoModeEnabledFromFile(globalConfigPath) ?? AUTO_MODE_DEFAULT_ENABLED;
}

/** The `/automode on|off` override pi-automode persists into the session, if any. */
export function readAutoModeSessionOverride(sessionManager: AutoModeSessionEntrySource): boolean | undefined {
  let entries: unknown[];
  try {
    entries = sessionManager.getEntries();
  } catch {
    return undefined;
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = toRecord(entries[index]);
    if (entry.type !== "custom" || entry.customType !== AUTO_MODE_STATE_ENTRY_TYPE) {
      continue;
    }

    const enabledOverride = toRecord(entry.data).enabledOverride;
    if (typeof enabledOverride === "boolean") {
      return enabledOverride;
    }
  }

  return undefined;
}

export interface AutoModeActivityOptions {
  toolNames: readonly (string | null)[];
  sessionManager: AutoModeSessionEntrySource;
  configuredEnabled: boolean;
}

export function isAutoModeActive(options: AutoModeActivityOptions): boolean {
  if (!isAutoModeExtensionLoaded(options.toolNames)) {
    return false;
  }

  return readAutoModeSessionOverride(options.sessionManager) ?? options.configuredEnabled;
}

/**
 * Whether an `ask` should be handed to pi-automode's classifier instead of
 * prompting. Both extensions gate every tool call and neither can see the
 * other's verdict, so without this an `ask` is asked *and* classified.
 */
export function shouldDeferAskToAutoMode(
  config: PermissionSystemExtensionConfig,
  autoModeActive: boolean,
): boolean {
  return config.deferAskToAutoMode === true && autoModeActive;
}
