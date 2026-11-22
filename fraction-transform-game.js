import { GAME, createDeck } from './fraction-transform-model.js';
import { startFractionGame } from './fraction-round.js';

startFractionGame(GAME, createDeck, { celebrate: true });
