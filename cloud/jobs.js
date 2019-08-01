/*******************************************************************************
*                                                                              *
*                                    JOBS                                      *
*                                                                              *
*        This class contains all parse jobs and their helper functions         *
*                                                                              *
 ******************************************************************************/

const Util = require('./util/utilFunctions.js')
const ParseObject = require('./util/parseObject.js')
const Cache = require('./util/cache.js')

Parse.Cloud.job("buildSearchCache", async (request) => {
    request.message("Job started");

    const cache = await getAll(ParseObject.SearchCache);
    const token = await Util.getSpotifyToken();

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

Parse.Cloud.job("consolidateSearchCache", async (request) => {
    request.message("Job started");

    const cache = await getAll(ParseObject.SearchCache);

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

Parse.Cloud.job("loadSearchCache", async (request) => {
    request.message("Job started");

    const caches = await getAllSearchCaches();

    request.message("Got the cached searches!");

    for (const cache of caches) {
        request.message(`Loading results for ${cache.get("query")}`);
        Cache.searchCache.set(cache.get("query"), cache.get("song"));
    }

    request.message(`Finished loading cache!`);

    return;
});


Parse.Cloud.job("removeSongURLPrefixes", async (request) => {
    request.message("Job started");

    const songs = await getAll(ParseObject.Song);

    request.message("Got all songs!");

    for (const song of songs) {
        request.message(`Removing URL prefix for ${song.get("title")}`);
        let url = song.get("artUrl");
        if (!url) continue;
        url = url.replace("https://i.scdn.co/image/", "");
        song.set("artUrl", url);
        await song.save();
    }

    request.message(`Finished removing prefixes!`);

    return;
});

async function getAllSearchCaches() {
    var result = [];
    var skip = false;
    const chunk_size = 1000;

    while (true) {
        // Get the next chunk
        const cacheQuery = new Parse.Query(ParseObject.SearchCache);
        cacheQuery.ascending("objectId");
        if (skip) cacheQuery.greaterThan("objectId", skip);
        cacheQuery.limit(chunk_size);
        cacheQuery.include("songs");
        const chunk = await cacheQuery.find();

        result = result.concat(chunk);
        if (chunk.length === chunk_size) {
            skip = chunk[chunk.length - 1].id;
        } else {
            break;
        }
    }

    return result;
}

async function getAll(type) {
    var result = [];
    var skip = false;
    const chunk_size = 1000;

    while (true) {
        // Get the next chunk
        const cacheQuery = new Parse.Query(type);
        cacheQuery.ascending("objectId");
        if (skip) cacheQuery.greaterThan("objectId", skip);
        cacheQuery.limit(chunk_size);
        const chunk = await cacheQuery.find();

        result = result.concat(chunk);
        if (chunk.length === chunk_size) {
            skip = chunk[chunk.length - 1].id;
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
    for (; query.length > 0; query = query.slice(0, -1)) {
        if (cachedQueries.has(query)) continue;

        cachedQueries.add(query);
        const result = await Util.searchSpotify(token, query, 50);
        Util.formatSearchResult(result, query);
    }
}

async function consolidateCache(query) {
    const cacheQuery = new Parse.Query(ParseObject.SearchCache);
    cacheQuery.equalTo("query", query);
    cacheQuery.include("song");

    const results = await cacheQuery.find();

    if (results.length == 1 && results[0].get("songs")) {
        return;
    }

    var formattedResult = [];
    for (const cachedResult of results) {
        formattedResult.push(cachedResult.get("song"));
        cachedResult.destroy();
    }

    const consolidatedCache = new ParseObject.SearchCache();
    consolidatedCache.set("query", query);
    consolidatedCache.set("songs", formattedResult);
    return await consolidatedCache.save();
}