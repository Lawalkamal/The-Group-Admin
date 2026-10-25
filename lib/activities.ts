import type { SharedGoalAction, SharedGoalCrewMember } from './types';

export type SharedGoalScenario = {
  id: string;
  title: string;
  blurb: string;
  outcome: string;
  actions: SharedGoalAction[];
};

/**
 * The fictional activity is deliberately content-light: a scenario, four
 * possible actions, and a target score. Adding a future activity (road trip,
 * festival, pop-up) means adding an entry here, not a new subsystem.
 *
 * Every point below is fictional. Nothing here is money, credit, or a purchase.
 */
export const SHARED_GOAL_SCENARIOS: SharedGoalScenario[] = [
  {
    id: 'night_market',
    title: 'Night Market Takeover',
    blurb:
      'A one-night stall at a fictional night market. Find the corner, test the food, and get a crowd before the lights go down.',
    outcome: 'The lights came on, the queue formed, and the stall sold out before midnight.',
    actions: [
      {
        id: 'scout',
        label: 'Scout the best corner',
        hint: 'Find the spot with the most foot traffic.',
        points: 15,
      },
      {
        id: 'cook',
        label: 'Cook a test batch',
        hint: 'Try the recipe on the crew first.',
        points: 20,
      },
      {
        id: 'sign',
        label: 'Paint the sign',
        hint: 'Make it impossible to walk past.',
        points: 10,
      },
      {
        id: 'rally',
        label: 'Rally the crew',
        hint: 'Get everyone to the stall on time.',
        points: 15,
      },
    ],
  },
  {
    id: 'road_trip',
    title: 'The Great Road Trip',
    blurb:
      'One car, a loose destination, and a plan that has to survive the first traffic jam. Make the details hold together.',
    outcome: 'They missed one turning, found a better one, and arrived with the playlist still playing.',
    actions: [
      {
        id: 'route',
        label: 'Chart the route',
        hint: 'Pick the stops worth the detour.',
        points: 15,
      },
      {
        id: 'pack',
        label: 'Pack the boot',
        hint: 'Someone has to remember the charger.',
        points: 10,
      },
      {
        id: 'playlist',
        label: 'Build the playlist',
        hint: 'No skipping until the bridge.',
        points: 10,
      },
      {
        id: 'lodge',
        label: 'Book the imaginary lodge',
        hint: 'Confirm the place with the good veranda.',
        points: 20,
      },
    ],
  },
  {
    id: 'festival',
    title: 'Neighbourhood Festival',
    blurb:
      'The community is putting on a festival. The stage, the food line, and the closing dance all have to land on the same day.',
    outcome: 'The festival ran past its curfew and nobody wanted to go home.',
    actions: [
      {
        id: 'stage',
        label: 'Build the stage',
        hint: 'Level ground. No wobble.',
        points: 20,
      },
      {
        id: 'volunteers',
        label: 'Recruit volunteers',
        hint: 'Twelve people, two-hour shifts.',
        points: 15,
      },
      {
        id: 'food',
        label: 'Sort the food line',
        hint: 'Nobody queues an hour for small chops.',
        points: 15,
      },
      {
        id: 'dance',
        label: 'Practise the dance',
        hint: 'The closing number cannot be improvised.',
        points: 10,
      },
    ],
  },
  {
    id: 'popup',
    title: 'Pop-up Shop Weekend',
    blurb:
      'A fictional shop that exists for one weekend. Stock it, dress the window, and see if anyone comes back twice.',
    outcome: 'The rail was empty by Sunday and the waiting list was not.',
    actions: [
      {
        id: 'storefront',
        label: 'Sketch the storefront',
        hint: 'Make the window do the talking.',
        points: 10,
      },
      {
        id: 'stock',
        label: 'Source the stock',
        hint: 'Find the thing people will queue for.',
        points: 20,
      },
      {
        id: 'train',
        label: 'Train the crew',
        hint: 'Everyone should know the prices.',
        points: 15,
      },
      {
        id: 'flyer',
        label: 'Design the flyer',
        hint: 'One clear date, one clear address.',
        points: 10,
      },
    ],
  },
];

export const CHEER_POINTS = 2;
export const GOAL_OPTIONS = [50, 100, 200] as const;
export const DEFAULT_GOAL = 100;

export function findScenario(id: unknown): SharedGoalScenario | null {
  if (typeof id !== 'string') return null;
  return SHARED_GOAL_SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

export function findScenarioAction(
  scenarioId: string,
  actionId: unknown,
): SharedGoalAction | null {
  if (typeof actionId !== 'string') return null;
  const scenario = findScenario(scenarioId);
  return scenario?.actions.find((action) => action.id === actionId) ?? null;
}

/** Contributions plus the small momentum each cheer adds. */
export function computeProgress(
  contributions: Array<{ points: number }>,
  cheerCount: number,
): number {
  return (
    contributions.reduce((total, contribution) => total + contribution.points, 0) +
    cheerCount * CHEER_POINTS
  );
}

/**
 * Picks the action with the most cheers. Ties fall to the scenario's order so
 * the group always sees a stable "group pick" instead of a flicker.
 */
export function spotlightAction(
  scenario: SharedGoalScenario | null,
  cheers: Array<{ actionId: string }>,
): string | null {
  if (!scenario || cheers.length === 0) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const action of scenario.actions) {
    const count = cheers.filter((cheer) => cheer.actionId === action.id).length;
    if (count > bestCount) {
      best = action.id;
      bestCount = count;
    }
  }
  return best;
}

export function topCrewMember(crew: SharedGoalCrewMember[]): SharedGoalCrewMember | null {
  const sorted = [...crew].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.moves !== a.moves) return b.moves - a.moves;
    return a.username.localeCompare(b.username);
  });
  return sorted[0] ?? null;
}

export function outcomeFor(
  scenario: SharedGoalScenario,
  top: SharedGoalCrewMember | null,
): string {
  if (!top || top.points === 0) return scenario.outcome;
  return `${scenario.outcome} ${top.username} did the most with ${top.points} points.`;
}
