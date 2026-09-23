import type { Skill } from "@devdigest/shared";
import type { SkillFormValue } from "./SkillForm";

/** Projection of a saved skill onto the form's editable fields. */
export function toSkillFormValue(skill: Skill): SkillFormValue {
  return {
    name: skill.name,
    description: skill.description,
    type: skill.type,
    body: skill.body,
  };
}

/**
 * Every required field carries real text. Whitespace does not count: a
 * space-only description is the one an agent would read as "no guidance".
 */
export function isSkillFormComplete(value: SkillFormValue): boolean {
  return (
    value.name.trim().length > 0 &&
    value.description.trim().length > 0 &&
    value.body.trim().length > 0
  );
}
