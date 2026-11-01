export function publishedChampionGames(games,statuses){
 return games.filter(game=>statuses.get(game.id)==='published');
}
