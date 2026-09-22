import type { SkillFormValue } from "./SkillForm";

/** A blank form. `rubric` is the default because it is the most common type. */
export const EMPTY_SKILL_FORM: SkillFormValue = {
  name: "",
  description: "",
  type: "rubric",
  body: "",
};
