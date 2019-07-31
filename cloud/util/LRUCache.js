/*******************************************************************************
*                                                                              *
*                                  LRU CACHE                                   *
*                                                                              *
 ******************************************************************************/
const parseObject = require('./parseObject.js')
var Yallist = require('yallist')

module.exports = LRUCache

function LRUCache(maxSize) {
    if (!(this instanceof LRUCache)) {
        return new LRUCache(maxSize)
    }

    this.maxSize = maxSize;
    this.map = new Map();
    this.list = new Yallist();
}

LRUCache.prototype.set = function (key, value) {
    if (this.map.has(key)) {
        let oldEntry = this.map.get(key);
        this.list.removeNode(oldEntry);
    }

    let newEntry = new Entry(key, value);
    this.list.unshift(newEntry);
    this.map.set(key, this.list.head);

    if (this.map.size > this.maxSize) {
        let deleteEntry = this.list.pop();
        this.map.delete(deleteEntry.key);
    }
}

LRUCache.prototype.get = function (key) {
    if (!this.map.has(key))
        return null;

    let node = this.map.get(key);
    this.list.unshiftNode(node);

    return node.value.value;
}

function Entry(key, value) {
    if (!(this instanceof Entry)) {
        return new Entry(key, value)
    }

    this.key = key;
    this.value = value
}