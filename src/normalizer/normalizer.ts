import type { NormalizerRuleSchema } from "../schema/scenario";
import type { z } from "zod";

type NormalizerRule = z.infer<typeof NormalizerRuleSchema>;

export function getDotPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split(".");
  let curr = obj;
  for (const part of parts) {
    if (curr === null || curr === undefined) return undefined;
    curr = curr[part];
  }
  return curr;
}

export function setDotPath(obj: any, path: string, value: any): void {
  if (!obj || !path) return;
  const parts = path.split(".");
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (curr[part] === undefined || curr[part] === null) {
      curr[part] = {};
    }
    curr = curr[part];
  }
  curr[parts[parts.length - 1]] = value;
}

function deleteDotPath(obj: any, path: string): void {
  if (!obj || !path) return;
  const parts = path.split(".");
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!curr || typeof curr !== "object") return;
    curr = curr[part];
  }
  if (curr && typeof curr === "object") {
    delete curr[parts[parts.length - 1]];
  }
}

export interface NormalizerOptions {
  fixedTimestamp?: number;
}

/**
 * Apply normalizer rules and return a new object; the input is left untouched.
 */
export function applyNormalizers(
  root: any,
  rules: NormalizerRule[],
  options: NormalizerOptions = {}
): any {
  const result = structuredClone(root);

  for (const rule of rules) {
    const { target, type, pattern, replacement } = rule;
    const currentVal = getDotPath(result, target);

    switch (type) {
      case "current_timestamp": {
        const ts = options.fixedTimestamp ?? Math.floor(Date.now() / 1000);
        setDotPath(result, target, ts);
        break;
      }
      case "mask": {
        if (currentVal !== undefined) {
          setDotPath(result, target, replacement ?? "<MASKED>");
        }
        break;
      }
      case "ignore": {
        deleteDotPath(result, target);
        break;
      }
      case "regex_replace": {
        if (currentVal !== undefined && currentVal !== null && pattern) {
          const strVal = String(currentVal);
          const reg = new RegExp(pattern);
          setDotPath(result, target, strVal.replace(reg, replacement ?? ""));
        }
        break;
      }
    }
  }

  return result;
}
