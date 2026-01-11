/**
 * Append alpha hex value to a hex color string
 * @param value - Hex color string (e.g., "#ff0000" or "#f00")
 * @param alpha - Two-character hex alpha value (e.g., "80" for 50% opacity)
 * @returns Color with alpha appended, or original value if not a valid hex color
 */
export function appendAlpha(value: string, alpha: string): string {
  if (!value || !value.startsWith('#')) return value;
  if (value.length === 7 || value.length === 4) {
    return `${value}${alpha}`;
  }
  return value;
}
