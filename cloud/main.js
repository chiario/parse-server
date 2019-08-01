const ParseObject = require('./util/parseObject.js')
const Util = require('./util/utilFunctions.js')
const Cache = require('./util/cache.js')
const LRUCache = require('./util/LRUCache.js')
require('./partyFunctions.js')
require('./playlistFunctions.js')
require('./jobs.js')

/**
 * This function searches spotify for a track
 *
 * @param query the search query
 * @param [limit = 20] the number of results to get, default 20
 * @throws error if the user is not in a party
 * @return a list of songs returned by the search
 */
Parse.Cloud.define("search", async (request) => {
    const query = request.params.query;

    let cached = Cache.searchCache.get(query);
    if (cached) {
        return cached;
    }

    const cachedResult = await Util.getCachedSearch(query);
    if (cachedResult) {
        Cache.searchCache.set(query, cachedResult);
        return cachedResult;
    }

    const token = await Util.getSpotifyToken();
    const limit = request.params.limit == null ? 20 : request.params.limit;
    const result = await Util.searchSpotify(token, query, limit);
    const formattedResult = await Util.formatSearchResult(result, query);
    Cache.searchCache.set(query, formattedResult);
    return formattedResult;
});