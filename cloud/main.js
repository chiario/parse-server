const parseObject = require('./util/parseObject.js')
const util = require('./util/utilFunctions.js')
require('./partyFunctions.js')
require('./playlistFunctions.js')

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
  const token = await util.getSpotifyToken();
  const query = request.params.query;
  const limit = request.params.limit == null ? 20 : request.params.limit;
  const useCache = request.params.useCache;

  if(useCache) {
    const cachedResult = await util.getCachedSearch(query, limit);
    return cachedResult;
  } else {
    const result = await util.searchSpotify(token, query, limit);
    return await util.formatSearchResult(result, query);
  }
});

Parse.Cloud.job("buildSearchCache", async (request) =>  {
  request.message("Job started");

  const cache = await getAllSearchCaches();
  const token = await util.getSpotifyToken();
  
  request.message("Got the cached results!");

  const queries = buildQuerySet(cache);
  const cachedQueries = new Set();
  
  request.message("Got unique queries!");

  for (const query of queries) {
    request.message(`Building cache for ${query}`);
    await buildCache(cachedQueries, query, token);
  }

  request.message(`Finished building cache!`);

  return Array.from(cachedQueries);
});

async function getAllSearchCaches() {
  var result = [];
  var skip = false;
  const chunk_size = 10;

  while(true) {
    // Get the next chunk
    const cacheQuery = new Parse.Query(parseObject.SearchCache);
    cacheQuery.ascending("objectId");
    if(skip) cacheQuery.greaterThan("objectId", skip);
    cacheQuery.limit(chunk_size);
    const chunk = await cacheQuery.find();

    result = result.concat(chunk);
    if (chunk.length === chunk_size) {
      skip = chunk[chunk.length-1].id;
    } else {
      break;
    }
  }

  return result;
}

function buildQuerySet(searchCaches) {
  let allQueries = searchCaches.map(a => a.get("query"));
  return new Set(allQueries);
}

async function buildCache(cachedQueries, query, token) {
  for(; query.length > 0; query = query.slice(0, -1)) {
    if(cachedQueries.has(query)) continue;

    cachedQueries.add(query);
    const result = await util.searchSpotify(token, query, 50);
    util.formatSearchResult(result, query);
  }
}