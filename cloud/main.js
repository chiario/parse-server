const parseObject = require('./util/parseObject.js')
const util = require('./util/utilFunctions.js')
require('./partyFunctions.js')
require('./playlistFunctions.js')

/**
 * This function searches spotify for a track
 *
 * @param query the search query
 * @param [limit = 20] the number of results to get, default 20
 * @throws error if the user is not in a party
 * @return a list of songs returned by the search
 */
Parse.Cloud.define("search", async (request) => {
  const token = await util.getSpotifyToken();
  const query = request.params.query;
  const limit = request.params.limit == null ? 20 : request.params.limit;

  const result = await util.searchSpotify(token, query, limit);
  return await util.formatSearchResult(result);
});
