import { GAME, createDeck } from './fraction-transform-model.js?v=948324aeed58';
import { startFractionGame } from './fraction-round.js?v=948324aeed58';

startFractionGame(GAME, createDeck, { celebrate: true });
