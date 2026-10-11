import type { CiFile } from "@devdigest/shared";
import { TRIGGER_VALUES, type Trigger } from "./constants";

/** Toggle a trigger and return the set in canonical order. */
export function toggleTrigger(current: readonly Trigger[], trigger: Trigger): Trigger[] {
  const next = current.includes(trigger) ? current.filter((t) => t !== trigger) : [...current, trigger];
  return TRIGGER_VALUES.filter((t) => next.includes(t));
}

/** Contents shown for a file: the user's edit when there is one, else the generated text. */
export function currentContents(file: CiFile, edits: Readonly<Record<string, string>>): string {
  return edits[file.path] ?? file.contents;
}

/** Only editable files whose text differs from the generated one are sent as edits (AC-94). */
export function changedEdits(
  files: readonly CiFile[],
  edits: Readonly<Record<string, string>>,
): { path: string; contents: string }[] {
  return files
    .filter((f) => f.editable && edits[f.path] !== undefined && edits[f.path] !== f.contents)
    .map((f) => ({ path: f.path, contents: edits[f.path]! }));
}

/** Whether a keydown target is a control that owns Enter itself. */
export function ownsEnter(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag === "TEXTAREA" || tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || tag === "A";
}
