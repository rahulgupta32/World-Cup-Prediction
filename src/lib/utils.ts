/**
 * Helper to identify placeholder/TBD team names in knockout fixtures.
 */
export function isTbdTeam(teamName: string | null | undefined): boolean {
  if (!teamName) return true;
  const name = teamName.toLowerCase().trim();
  return (
    name === "tbd" ||
    name === "tbc" ||
    name.includes("tbd") ||
    name.includes("tbc") ||
    name.includes("to be determined") ||
    name.includes("winner") ||
    name.includes("runner-up") ||
    name.includes("runner up") ||
    name.includes("group") ||
    name.includes("loser")
  );
}
