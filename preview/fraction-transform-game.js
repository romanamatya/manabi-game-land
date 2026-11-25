import { GAME, createDeck } from './fraction-transform-model.js?v=e6c15133f25b';
import { startFractionGame } from './fraction-round.js?v=e6c15133f25b';

startFractionGame(GAME, createDeck, { celebrate: true });
