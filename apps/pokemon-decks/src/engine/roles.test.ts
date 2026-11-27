/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { realCard, testCatalog } from '../test/catalog';
import { rolesOf } from './roles';

const catalog = testCatalog('standard');
const roles = (id: string) => rolesOf(realCard(catalog, id));

// Each pattern in roles.ts names the card it was written against; these pin them.
describe('rolesOf', () => {
  it.each([
    ['sv01-189', "Professor's Research", ['draw']],
    ['svp-124', 'Iono', ['draw']],
    ['me01-119', "Lillie's Determination", ['draw']],
    ['me01-131', 'Ultra Ball', ['pokemonSearch']],
    ['sv01-181', 'Nest Ball', ['pokemonSearch']],
    ['sv05-144', 'Buddy-Buddy Poffin', ['pokemonSearch']],
    ['sv08-185', 'Precious Trolley', ['pokemonSearch']],
    ['sv04-163', 'Earthen Vessel', ['energySearch']],
    ['me03-072', 'Energy Search', ['energySearch']],
    ['sv01-166', 'Arven', ['trainerSearch']],
    ['me01-114', "Boss's Orders", ['gust']],
    ['sv04-160', 'Counter Catcher', ['gust']],
    ['sv05-157', 'Prime Catcher', ['gust', 'switch']],
    ['me01-130', 'Switch', ['switch']],
    ['sv02-188', 'Super Rod', ['recovery']],
    ['sv06.5-061', 'Night Stretcher', ['recovery']],
    ['sv10.5w-082', 'Energy Retrieval', ['recovery']],
    ['me01-125', 'Rare Candy', ['skipStage']],
    ['sv10-003', 'Yanmega ex (Buzzing Boost: "Basic {G} Energy")', ['energyAccel']],
  ])('%s %s', (id, _name, expected) => {
    expect(roles(id)).toEqual(expected);
  });

  it('gives basic Energy no roles', () => {
    expect(roles('sve-001')).toEqual([]);
  });
});
