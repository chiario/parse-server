const LRUCache = require('./LRUCache.js')

module.exports = {
    searchCache: new LRUCache(1500),
    songCache: new LRUCache(30000),
    partyCache: new LRUCache(100)
}