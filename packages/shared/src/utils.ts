export function toKebabCase(str: string): string {
  return (
    str
      // Handle camelCase and PascalCase
      .replace(/([A-Z])/g, (_match, p1, offset) =>
        offset > 0 ? `-${p1.toLowerCase()}` : p1.toLowerCase(),
      )
      // Handle snake_case
      .replace(/_/g, "-")
      // Handle spaces
      .replace(/\s+/g, "-")
      .toLowerCase()
  );
}

export function toSentence(str: string): string {
  return str.replace(/([A-Z])/g, (_match, p1, offset) => (offset > 0 ? ` ${p1}` : p1));
}

export function toTitle(str: string): string {
  return (
    str
      // Handle kebab-case and snake_case
      .replace(/[-_]/g, " ")
      // Handle camelCase and PascalCase
      .replace(/([A-Z])/g, (_match, p1, offset) => (offset > 0 ? ` ${p1}` : p1))
      // Capitalize first letter of each word
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ")
  );
}
