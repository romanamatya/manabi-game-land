import { GAME, createDeck } from './fraction-transform-model.js?v=39ecd2f77061';
import { startFractionGame } from './fraction-round.js?v=39ecd2f77061';

startFractionGame(GAME, createDeck, { celebrate: true });
