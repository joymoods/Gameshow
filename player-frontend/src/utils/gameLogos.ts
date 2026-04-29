import brainstormLogo from '../assets/brainstorm-logo.png';

export const GAME_LOGOS: Record<string, string> = {
  jeopardy: brainstormLogo,
};

export function getGameLogo(gameType: string | null | undefined): string | null {
  if (!gameType) return null;
  return GAME_LOGOS[gameType] ?? null;
}
