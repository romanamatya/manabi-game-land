import { GAME, createDeck } from './fraction-transform-model.js?v=63ff8c4f8736';
import { startFractionGame } from './fraction-round.js?v=63ff8c4f8736';

startFractionGame(GAME, createDeck, { celebrate: true });
