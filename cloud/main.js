const parseObject = require('./util/parseObject.js')
const util = require('./util/utilFunctions.js')
const LRUCache = require('./util/LRUCache.js')
require('./partyFunctions.js')
require('./playlistFunctions.js')
require('./jobs.js')

const cache = new LRUCache(1000);

/**
 * This function searches spotify for a track
 *
 * @param query the search query
 * @param [limit = 20] the number of results to get, default 20
 * @param useCache whether or not to use the cache to speed up search
 * @throws error if the user is not in a party
 * @return a list of songs returned by the search
 */
Parse.Cloud.define("search", async (request) => {
    const query = request.params.query;
    const useCache = request.params.useCache;

    let cached = cache.get(query);
    if (cached) {
        return cached;
    }

    if (useCache) {
        const cachedResult = await util.getCachedSearch(query);
        if (cachedResult) {
            cache.set(query, cachedResult);
            return cachedResult;
        }
    }
    const token = await util.getSpotifyToken();
    const limit = request.params.limit == null ? 20 : request.params.limit;
    const result = await util.searchSpotify(token, query, limit);
    const formattedResult = await util.formatSearchResult(result, query);
    cache.set(query, formattedResult);
    return formattedResult;
});