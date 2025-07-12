export const STATES = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'game_over'
};

export class StateManager {
  constructor(initial = STATES.MENU) {
    this.current = initial;
  }

  get() {
    return this.current;
  }

  set(state) {
    if (!Object.values(STATES).includes(state)) {
      throw new Error(`Invalid state: ${state}`);
    }
    this.current = state;
  }

  is(state) {
    return this.current === state;
  }

  canTransitionTo(state) {
    const allowed = {
      [STATES.MENU]: [STATES.PLAYING],
      [STATES.PLAYING]: [STATES.PAUSED, STATES.GAME_OVER],
      [STATES.PAUSED]: [STATES.PLAYING, STATES.GAME_OVER],
      [STATES.GAME_OVER]: [STATES.MENU]
    };
    return (allowed[this.current] || []).includes(state);
  }

  transition(state) {
    if (this.canTransitionTo(state)) {
      this.current = state;
      return true;
    }
    return false;
  }
}
