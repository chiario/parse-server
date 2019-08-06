/*******************************************************************************
*                                                                              *
*                               HELPER FUNCTIONS                               *
*                                                                              *
 ******************************************************************************/
const ParseObject = require('./parseObject.js')
const Spotify = require('./spotifyAPI.js')
const Cache = require('./cache.js')

module.exports = {
    /**
     * Gets the party the user is currently part of.  If no such party exists,
     * throws an error.
     *
     * @param user the user whose party will be obtained
     * @throws error if the user is not in a party
     */
    getPartyFromUser: async function (user) {
        // check if the current user has a party
        const partyPointer = user.get("currParty");
        if (partyPointer == null) {
            return null;
        }

        // Try getting the party from the cache
        const cachedParty = Cache.partyCache.get(partyPointer.id);
        if (cachedParty) {
            return cachedParty;
        }

        // get the user's current party
        const partyQuery = new Parse.Query(ParseObject.Party);
        partyQuery.include("currPlaying");
        const party = await partyQuery.get(partyPointer.id);
        Cache.partyCache.set(partyPointer.id, party);
        return party;
    },

    /**
     * Returns a song in a party's playlist
     *
     * @param song the song to check
     * @param party the party whose playlist will be checked for the song
     * @return the playlist entry for the song in the specified party
     */
    getPlaylistEntry: async function (party, spotifyId) {
        let playlist = await this.getCachedPlaylist(party)

        return playlist.get(spotifyId);
    },

    cachePlaylist: async function (party) {
        const entries = await this.getPlaylistForParty(party);
        const playlist = new Map();
        for (const entry of entries) {
            playlist.set(entry.get("song").get("spotifyId"), entry);
        }

        Cache.playlistCache.set(party.id, playlist);
        return playlist;
    },

    /**
     * Returns a song with the specified Spotify ID.
     *
     * @param spotifyId the Spotify ID of the song to obtain
     * @return a song from the database with the specified Spotify ID
     * @throws error if there is no song in the database with the specified Spotify
     *         ID
     */
    getSongById: async function (spotifyId) {
        // Check the song cache
        let cachedSong = Cache.songCache.get(spotifyId);
        if (cachedSong) {
            return cachedSong;
        }

        const songQuery = new Parse.Query(ParseObject.Song);
        songQuery.equalTo("spotifyId", spotifyId);
        return await songQuery.first();
    },

    /**
     * If a song with the same spotifyId already exists in the database, returns a
     * reference to the existing song in the database.
     *
     * If no song in the database has the same spotifyId, saves the song to the
     * database
     *
     * @param song a song to save to the database
     * @return a reference to a song in the database with the same spotifyId
     */
    saveSong: async function (song) {
        const spotifyId = song.get("spotifyId");

        // Check the song cache
        let cachedSong = Cache.songCache.get(spotifyId);
        if (cachedSong) {
            return cachedSong;
        }

        // Check if a song with the same spotifyId is already in the database
        const songQuery = new Parse.Query(ParseObject.Song);
        songQuery.equalTo("spotifyId", spotifyId);
        cachedSong = await songQuery.first();
        if (!cachedSong) {
            // If not, save the song to the database
            cachedSong = await song.save();
        }

        Cache.songCache.set(spotifyId, cachedSong);
        return cachedSong;
    },

    /**
     * Checks if the user is the admin of the specified party
     *
     * @param user the user whose privileges should be checked
     * @param party the party to check the user's privileges for
     * @throws error if the user is not the party's admin
     */
    isUserAdmin: function (user, party) {
        return party.get("admin") != null && party.get("admin").id == user.id;
    },

    /**
     * Checks if the user has liked a song
     *
     * @param entry the entry to whose likes to check
     * @param user the user whose like to check
     */
    isEntryLikedByUser: async function (entry, user) {
        const likeQuery = new Parse.Query(ParseObject.Like);
        likeQuery.equalTo("entry", entry);
        likeQuery.equalTo("user", user);
        return await likeQuery.first() != null;
    },

    /**
     * Gets a like object from a user and entry
     *
     * @param entry get likes for this playlist entry
     * @param user get likes for this user
     * @throws an error if the like does not exist
     */
    getLike: async function (entry, user) {
        const likeQuery = new Parse.Query(ParseObject.Like);
        likeQuery.equalTo("entry", entry);
        likeQuery.equalTo("user", user);
        return await likeQuery.first();
    },

    /**
     * Gets a valid Spotify access token.  Checks to see if there is already a valid
     * access token cached and if not, creates a new one.
     *
     * There are no paramters for this function.
     * @return a spotify access token string
     */
    getSpotifyToken: async function () {
        // Check to see if a token already exists
        const tokenQuery = new Parse.Query(ParseObject.SpotifyToken);
        tokenQuery.descending("createdAt");
        var token = await tokenQuery.first();
        if (token) {
            // If a token already exists, see if it has expired yet
            const currentDate = new Date();
            const tokenDate = token.get("createdAt");
            const diffSecs = (currentDate.getTime() - tokenDate.getTime()) / 1000;
            // Refresh the token 1 minute before it expires
            if (diffSecs < token.get("expiresIn") - 60) {
                return token.get("value");
            } else {
                // Destroy the token if it is expired
                await token.destroy();
            }
        }

        // Otherwise, create a new token
        const tokenRaw = await Spotify.getAccessToken();
        token = new ParseObject.SpotifyToken();
        token.set("value", tokenRaw.access_token);
        token.set("type", tokenRaw.token_type);
        token.set("expiresIn", tokenRaw.expires_in);
        await token.save();
        return token.get("value");
    },

    searchSpotify: async function (token, query, limit) {
        return await Spotify.search(token, query, limit)
    },

    /**
     * Formats the response from a Spotify search into an array of song objects.
     *
     * @param result the JSON result from a Spotify search request
     * @return a list of song objects
     */
    getCachedSearch: async function (query) {
        const cacheQuery = new Parse.Query(ParseObject.SearchCache);
        cacheQuery.equalTo("query", query);
        cacheQuery.include("songs");

        const results = await cacheQuery.first();
        if (results) {
            return results.get("songs");
        } else {
            return null;
        }
    },

    /**
     * Formats the response from a Spotify search into an array of song objects.
     *
     * @param result the JSON result from a Spotify search request
     * @return a list of song objects
     * todo: break this up
     */
    formatSearchResult: async function (result, query) {
        var formattedResult = [];
        for (const track of result.tracks.items) {
            // Create a new song from the result json
            const song = new ParseObject.Song();
            song.set("spotifyId", track.id);
            song.set("artist", track.artists[0].name);
            song.set("title", track.name);
            song.set("album", track.album.name);
            song.set("artUrl", track.album.images[0].url);

            // Add it to the return array
            const cachedSong = await this.saveSong(song);
            formattedResult.push(cachedSong);
        }

        const cacheQuery = new Parse.Query(ParseObject.SearchCache);
        cacheQuery.equalTo("query", query);
        if (!await cacheQuery.first()) {
            const cache = new ParseObject.SearchCache();
            cache.set("query", query);
            cache.set("songs", formattedResult);
            await cache.save();
        }

        return formattedResult;
    },

    cacheResults: function (query, results) {
        let cachedIds = [];
        for (const song of results) {
            Cache.songCache.set(song.id, song);
            cachedIds.push(song.id);
        }
        Cache.searchCache.set(query, cachedIds);
        return results;
    },

    updateEntryScore: function (entry) {
        const numLikes = entry.get("numLikes");

        //TODO: integrate other factors here

        entry.set("score", numLikes);
    },

    /**
     * Gets a party's playlist and formats it for the current user.
     *
     * @param user the user who is making the request
     * @param party the party the user is currently in
     * @return the party's playlist as a list of playlist entries
     */
    getPlaylistForParty: async function (party) {
        const playlistQuery = new Parse.Query(ParseObject.PlaylistEntry);
        playlistQuery.equalTo("party", party);
        playlistQuery.descending("score");
        playlistQuery.include("song");
        return await playlistQuery.find();
    },

    addEntryToPlaylist: async function (party, entry) {
        let playlist = await this.getCachedPlaylist(party)

        const spotifyId = entry.get("song").get("spotifyId");
        playlist.set(spotifyId, entry);

        this.indicatePlaylistUpdated(party);
    },

    removeEntryFromPlaylist: async function (party, entry) {
        let playlist = await this.getCachedPlaylist(party)

        const spotifyId = entry.get("song").get("spotifyId");
        playlist.delete(spotifyId, entry);

        this.indicatePlaylistUpdated(party);
    },

    indicatePlaylistUpdated: async function (party) {
        let playlist = await this.getCachedPlaylist(party)

        party.set("playlistLastUpdatedAt", new Date());
        party.set("cachedPlaylist", this.getPlaylistAsString(playlist));
        await party.save();

        return playlist;
    },

    getCachedPlaylist: async function (party) {
        let playlist = Cache.playlistCache.get(party.id);
        if (!playlist) {
            playlist = await this.cachePlaylist(party);
        }
        return playlist;
    },

    getPlaylistAsString: function (playlist) {
        const orderedPlaylist = [...playlist.values()].sort((a, b) => { return b.get("score") - a.get("score") });
        return JSON.stringify(orderedPlaylist);
    },

    /**
     * Generates a 4 character long unique join code that can be used to join a
     * party.
     *
     * This function has no paramters
     * @return a 4 character long string
     */
    generateJoinCode: async function () {
        // TODO: make this not sketchy
        // Limit the amount of retries to 100
        for (var i = 0; i < 100; i++) {
            const joinCode = Math.random().toString(36).substr(2, 4);
            const partyQuery = new Parse.Query(ParseObject.Party);
            partyQuery.equalTo("joinCode", joinCode);
            if (!await partyQuery.first()) {
                return joinCode;
            }
        }
        throw "Could not generate a unique join code!";
    },

    getPartyByJoinCode: async function (joinCode) {
        const partyQuery = new Parse.Query(ParseObject.Party);
        partyQuery.equalTo("joinCode", joinCode);
        partyQuery.include("currPlaying");
        const party = await partyQuery.first();

        // Try getting the party from the cache
        const cachedParty = Cache.partyCache.get(party.id);
        if (cachedParty) {
            return cachedParty;
        }
        Cache.partyCache.set(party.id, party);
        return party;
    },

    getLikesForUser: async function (user) {
        const likeQuery = new Parse.Query(ParseObject.Like);
        likeQuery.equalTo("user", user);
        return await likeQuery.find();
    },

    cleanupPlaylistEntries: async function (party) {
        const deleteQuery = new Parse.Query(ParseObject.PlaylistEntry);
        deleteQuery.equalTo("party", party);
        deleteQuery.find().then(function (entries) {
            const deleteQuery = new Parse.Query(ParseObject.Like);
            deleteQuery.containedIn("entry", entries);
            deleteQuery.find().then(function (likes) {
                Parse.Object.destroyAll(likes);
            });
            Parse.Object.destroyAll(entries);
        });
    },

    cleanupLikes: async function (entry) {
        const deleteQuery = new Parse.Query(ParseObject.Like);
        deleteQuery.equalTo("entry", entry);
        deleteQuery.find().then(function (likes) {
            Parse.Object.destroyAll(likes);
        })
    }
}
