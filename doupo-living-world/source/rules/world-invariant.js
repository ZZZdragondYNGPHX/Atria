export default {
 invariant({reads}){
  const people=reads.population.records,live=people.filter(r=>r.id!=='player'&&r.value.alive).length;
  return live+reads.game.state.reservations.length<=reads.game.state.cap&&new Set(people.map(r=>r.id)).size===people.length;
 }
};
