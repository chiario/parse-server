/*******************************************************************************
*                                                                              *
*                               HELPER FUNCTIONS                               *
*                                                                              *
 ******************************************************************************/
const parseObject = require('./parseObject.js')
const spotify = require('./spotifyAPI.js')

module.exports = {
  /**
   * Gets the party the user is currently part of.  If no such party exists,
   * throws an error.
   *
   * @param user the user whose party will be obtained
   * @throws error if the user is not in a party
   */
  getPartyFromUser: async function(user) {
    // check if the current user has a party
    const partyPointer = user.get("currParty");
    if(partyPointer == null) {
      return null;
    }

    // get the user's current party
    const partyQuery = new Parse.Query(parseObject.Party);
    partyQuery.include("currPlaying");
    const party = await partyQuery.get(partyPointer.id);
    return party;
  },

  /**
   * Returns a song in a party's playlist
   *
   * @param song the song to check
   * @param party the party whose playlist will be checked for the song
   * @return the playlist entry for the song in the specified party
   */
  getPlaylistEntry: async function(song, party) {
    const playlistQuery = new Parse.Query(parseObject.PlaylistEntry);
    playlistQuery.equalTo("party", party);
    playlistQuery.equalTo("song", song);
    return await playlistQuery.first();
  },

  /**
   * Returns a song in a party's playlist
   *
   * @param song the song to check
   * @param party the party whose playlist will be checked for the song
   * @return the playlist entry for the song in the specified party
   */
  getEntryBySpotifyId: async function(spotifyId, party) {
    const song = await this.getSongById(spotifyId);
    if(song == null) {
      return null;
    }
    return await this.getPlaylistEntry(song, party);
  },

  /**
   * Returns an entry in a party's playlist
   *
   * @param entryId the object ID of the entry to retrieve
   * @return the playlist entry with the given entry ID
   */
  getEntryById: async function(entryId) {
    const playlistQuery = new Parse.Query(parseObject.PlaylistEntry);
    return await playlistQuery.get(entryId);
  },

  /**
   * Returns a song with the specified Spotify ID.
   *
   * @param spotifyId the Spotify ID of the song to obtain
   * @return a song from the database with the specified Spotify ID
   * @throws error if there is no song in the database with the specified Spotify
   *         ID
   */
  getSongById: async function(spotifyId) {
    const songQuery = new Parse.Query(parseObject.Song);
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
  saveSong: async function(song) {
    // Check if a song with the same spotifyId is already in the database
    const songQuery = new Parse.Query(parseObject.Song);
    songQuery.equalTo("spotifyId", song.get("spotifyId"));
    var cachedSong = await songQuery.first();
    if(!cachedSong) {
      // If not, save the song to the database
      cachedSong = await song.save();
    }
    return cachedSong;
  },

  /**
   * Checks if the user is the admin of the specified party
   *
   * @param user the user whose privileges should be checked
   * @param party the party to check the user's privileges for
   * @throws error if the user is not the party's admin
   */
  isUserAdmin: function(user, party) {
    return party.get("admin") != null && party.get("admin").id == user.id;
  },

  /**
   * Checks if the user has liked a song
   *
   * @param entry the entry to whose likes to check
   * @param user the user whose like to check
   */
  isEntryLikedByUser: async function(entry, user) {
    const likeQuery = new Parse.Query(parseObject.Like);
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
  getLike: async function(entry, user) {
    const likeQuery = new Parse.Query(parseObject.Like);
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
  getSpotifyToken: async function() {
    // Check to see if a token already exists
    const tokenQuery = new Parse.Query(parseObject.SpotifyToken);
    tokenQuery.descending("createdAt");
    var token = await tokenQuery.first();
    if(token) {
      // If a token already exists, see if it has expired yet
      const currentDate = new Date();
      const tokenDate = token.get("createdAt");
      const diffSecs = (currentDate.getTime() - tokenDate.getTime()) / 1000;
      // Refresh the token 1 minute before it expires
      if(diffSecs < token.get("expiresIn") - 60) {
        return token.get("value");
      } else {
        // Destroy the token if it is expired
        await token.destroy();
      }
    }

    // Otherwise, create a new token
    const tokenRaw = await spotify.getAccessToken();
    token = new parseObject.SpotifyToken();
    token.set("value", tokenRaw.access_token);
    token.set("type", tokenRaw.token_type);
    token.set("expiresIn", tokenRaw.expires_in);
    await token.save();
    return token.get("value");
  },

  searchSpotify: async function(token, query, limit) {
    return await spotify.search(token, query, limit)
  },

  /**
   * Formats the response from a Spotify search into an array of song objects.
   *
   * @param result the JSON result from a Spotify search request
   * @return a list of song objects
   */
  getCachedSearch: async function(query) {
    const cacheQuery = new Parse.Query(parseObject.SearchCache);
    cacheQuery.equalTo("query", query);
    cacheQuery.include("songs");

    const results = await cacheQuery.first();
    if(results) {
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
  formatSearchResult: async function(result, query) {
    var formattedResult = [];
    for(const track of result.tracks.items) {
      // Create a new song from the result json
      const song = new parseObject.Song();
      song.set("spotifyId", track.id);
      song.set("artist", track.artists[0].name);
      song.set("title", track.name);
      song.set("album", track.album.name);
      song.set("artUrl", track.album.images[0].url);

      // Add it to the return array
      const cachedSong = await this.saveSong(song);
      formattedResult.push(cachedSong);
    }

    const cacheQuery = new Parse.Query(parseObject.SearchCache);
    cacheQuery.equalTo("query", query);
    if(!await cacheQuery.first()) {
      const cache = new parseObject.SearchCache();
      cache.set("query", query);
      cache.set("songs", formattedResult);
      await cache.save();
    }

    return formattedResult;
  },

  updateEntryScore: async function(entry) {
    const numLikes = entry.get("numLikes");

    //TODO: integrate other factors here

    entry.set("score", numLikes);
    await entry.save();
  },

  /**
   * Gets a party's playlist and formats it for the current user.
   *
   * @param user the user who is making the request
   * @param party the party the user is currently in
   * @return the party's playlist as a list of playlist entries
   */
  getPlaylistForParty: async function(user, party) {
    const playlistQuery = new Parse.Query(parseObject.PlaylistEntry);
    playlistQuery.equalTo("party", party);
    playlistQuery.descending("score");
    playlistQuery.include("song");
    const playlist = await playlistQuery.find();

    // TODO: preferably find less sketchy way of doing this
    const result = [];
    for(const entry of playlist) {
      const entryJson = entry.toJSON();
      entryJson.className = entry.className;
      entryJson.isLikedByUser = await this.isEntryLikedByUser(entry, user);
      result.push(Parse.Object.fromJSON(entryJson));
    }
    return result;
  },

  indicatePlaylistUpdated: async function(party, user) {
    const playlist = await this.getPlaylistForParty(user, party);

    party.set("playlistLastUpdatedAt", new Date());
    party.set("cachedPlaylist", JSON.stringify(playlist));
    await party.save();

    return playlist;
  },

  /**
   * Generates a 4 character long unique join code that can be used to join a
   * party.
   *
   * This function has no paramters
   * @return a 4 character long string
   */
  generateJoinCode: async function() {
    // TODO: make this not sketchy
    // Limit the amount of retries to 100
    for(var i = 0; i < 100; i++) {
      const joinCode = Math.random().toString(36).substr(2, 4);
      const partyQuery = new Parse.Query(parseObject.Party);
      partyQuery.equalTo("joinCode", joinCode);
      if(!await partyQuery.first()) {
        return joinCode;
      }
    }
    throw "Could not generate a unique join code!";
  },

  getPartyByJoinCode: async function(joinCode) {
    const partyQuery = new Parse.Query(parseObject.Party);
    partyQuery.equalTo("joinCode", joinCode);
    partyQuery.include("currPlaying");
    return await partyQuery.first();
  },

  getLikesForUser: async function(user) {
    const likeQuery = new Parse.Query(parseObject.Like);
    likeQuery.equalTo("user", user);
    return await likeQuery.find();
  },

  cleanupPlaylistEntries: async function(party) {
    const deleteQuery = new Parse.Query(parseObject.PlaylistEntry);
    deleteQuery.equalTo("party", party);
    deleteQuery.find().then(function(entries) {
      const deleteQuery = new Parse.Query(parseObject.Like);
      deleteQuery.containedIn("entry", entries);
      deleteQuery.find().then(function(likes) {
        Parse.Object.destroyAll(likes);
      });
      Parse.Object.destroyAll(entries);
    });
  }
}
