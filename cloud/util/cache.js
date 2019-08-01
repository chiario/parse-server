const LRUCache = require('./LRUCache.js')

module.exports = {
    searchCache: new LRUCache(2000),
    partyCache: new LRUCache(100)
}