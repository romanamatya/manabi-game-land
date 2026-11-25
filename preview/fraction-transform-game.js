import { GAME, createDeck } from './fraction-transform-model.js?v=537bd87d6552';
import { startFractionGame } from './fraction-round.js?v=537bd87d6552';

startFractionGame(GAME, createDeck, { celebrate: true });
