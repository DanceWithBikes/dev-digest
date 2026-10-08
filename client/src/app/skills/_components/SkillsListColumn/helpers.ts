import type { Skill } from "@devdigest/shared";

/** Case-insensitive match over the fields a user would search by. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.type.toLowerCase().includes(q),
  );
}

/** True for skills that came from outside this workspace — shown as provenance. */
export function isImported(skill: Skill): boolean {
  return skill.source === "imported_file" || skill.source === "imported_url";
}
