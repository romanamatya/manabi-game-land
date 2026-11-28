import { GAME, createDeck } from './fraction-transform-model.js?v=d1ceb7680050';
import { startFractionGame } from './fraction-round.js?v=d1ceb7680050';

startFractionGame(GAME, createDeck, { celebrate: true });
