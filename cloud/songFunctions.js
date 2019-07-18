const util = require('./util/utilFunctions.js')
const parseObject = require('./util/parseObject.js')

/**
 * This function adds a song to the current user's party
 *
 * @param artist the song's artist from Spotify API
 * @param title the song's title from Spotify API
 * @param album the song's album name from Spotify API
 * @param artUrl the song's album art URL from Spotify API
 * @param spotifyId the song's Spotify ID from Spotify API
 * @throws error if the user is not in a party or the song is already in the
 *         current party's playlist
* @return the playlist entry that was added
 */
Parse.Cloud.define("addSong", async (request) => {
  const user = request.user;
  const party = await util.getPartyFromUser(user);
  const song = new parseObject.Song();
  song.set("artist", request.params.artist);
  song.set("title", request.params.title);
  song.set("album", request.params.album);
  song.set("artUrl", request.params.artUrl);
  song.set("spotifyId", request.params.spotifyId);

  // Save the song to the database
  const cachedSong = await util.saveSong(song);

  if(await util.isSongInParty(cachedSong, party)) {
    // TODO: maybe like the song instead?
    throw 'Song is already in the playlist!';
  } else {
    // Add song to party
    const entry = new parseObject.PlaylistEntry();
    entry.set("song", cachedSong);
    entry.set("party", party);
    entry.set("score", 0); // TODO: calculate this
    return await entry.save();
  }
});

/**
 * This function removes a song from the current user's party
 *
 * @param spotifyId the song's Spotify ID from Spotify API
 * @throws error if the user is not the admin of their current party or if the
 *         song isn't in the party's playlist
 * @return the playlist entry that was removed
 */
Parse.Cloud.define("removeSong", async (request) => {
  const user = request.user;
  const party = await util.getPartyFromUser(user);
  if(!util.isUserAdmin(user, party)) {
    throw "User is not the admin of their party!";
  }

  const song = await util.getSongById(request.params.spotifyId);

  if(await isSongInParty(song, party)) {
    const entry = await util.getPlaylistEntry(song, party);
    return await entry.destroy();
  } else {
    throw 'Song is not in the playlist!';
  }
});

/**
 * This function adds a the current user's like to a playlist entry
 *
 * @param entryId the playlist entry's object ID
 * @throws error if the user is not the in a party, if the song isn't in the
 * party's playlist, or if the user has already liked the song
 * @return the updated playlist?
 */
Parse.Cloud.define("likeSong", async (request) => {
  const user = request.user;
  const party = await util.getPartyFromUser(user);
  const entry = await util.getEntryById(request.params.entryId);

  if(!await util.isEntryLikedByUser(entry, user)) {
    const like = new parseObject.Like();
    like.set("user", user);
    like.set("entry", entry);
    return await like.save();
  } else {
    throw 'User has already liked the song!';
  }
});

/**
 * This removes the current user's like from a playlist entry
 *
 * @param entryId the playlist entry's object ID
 * @throws error if the user is not the in a party, if the song isn't in the
 * party's playlist, or if the user has not yet liked the song
 * @return the updated playlist?
 */
Parse.Cloud.define("unlikeSong", async (request) => {
  const user = request.user;
  const party = await util.getPartyFromUser(user);
  const entry = await util.getEntryById(request.params.entryId);

  if(await util.isEntryLikedByUser(entry, user)) {
    const like = await util.getLike(entry, user);
    return await like.destroy();
  } else {
    throw 'User has not liked the song!';
  }
});

/**
 * This function searches spotify for a track
 *
 * @param query the search query
 * @param [limit = 20] the number of results to get, default 20
 * @throws error if the user is not in a party
 * @return a list of songs returned by the search
 */
Parse.Cloud.define("search", async (request) => {
  const token = await util.getSpotifyToken();
  const query = request.params.query;
  const limit = request.params.limit == null ? 20 : request.params.limit;

  const result = await util.searchSpotify(token, query, limit);
  return await util.formatSearchResult(result);
});
