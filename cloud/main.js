const parseObject = require('./util/parseObject.js')
const util = require('./util/utilFunctions.js')
const LRUCache = require('./util/LRUCache.js')
require('./partyFunctions.js')
require('./playlistFunctions.js')

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
  if(cached) {
    return cached;
  }

  if(useCache) {
    const cachedResult = await util.getCachedSearch(query);
    if(cachedResult) {
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
  const chunk_size = 1000;

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

async function consolidateCache(query) {
  const cacheQuery = new Parse.Query(parseObject.SearchCache);
  cacheQuery.equalTo("query", query);
  cacheQuery.include("song");

  const results = await cacheQuery.find();

  if(results.length == 1 && results[0].get("songs")) {
    return;
  }

  var formattedResult = [];
  for(const cachedResult of results) {
    formattedResult.push(cachedResult.get("song"));
    cachedResult.destroy();
  }

  const consolidatedCache = new parseObject.SearchCache();
  consolidatedCache.set("query", query);
  consolidatedCache.set("songs", formattedResult);
  return await consolidatedCache.save();
}

Parse.Cloud.job("consolidateSearchCache", async (request) =>  {
  request.message("Job started");

  const cache = await getAllSearchCaches();
  
  request.message("Got the cached results!");

  const queries = buildQuerySet(cache);
  
  request.message("Got unique queries!");

  for (const query of queries) {
    request.message(`Consolidating cache for ${query}`);
    await consolidateCache(query);
  }

  request.message(`Finished consolidating cache!`);

  return;
});



Parse.Cloud.define("testLRU", async (request) => {
  const cache = new LRUCache(9);
  
  cache.set("t", 1);
  cache.set("te", 2);
  cache.set("tes", 3);
  cache.set("test", 4);
  cache.set("t", 5);

  return cache.get("t");
});