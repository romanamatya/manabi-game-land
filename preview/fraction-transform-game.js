import { GAME, createDeck } from './fraction-transform-model.js?v=22bac70c2625';
import { startFractionGame } from './fraction-round.js?v=22bac70c2625';

startFractionGame(GAME, createDeck, { celebrate: true });
