import { GAME, createDeck } from './fraction-transform-model.js?v=83a378df8909';
import { startFractionGame } from './fraction-round.js?v=83a378df8909';

startFractionGame(GAME, createDeck, { celebrate: true });
