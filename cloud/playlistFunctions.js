/*******************************************************************************
*                                                                              *
*                              PLAYLIST FUNCTIONS                              *
*                                                                              *
*  This class contains all cloud functions that manipulate a party's playlist  *
*                                                                              *
 ******************************************************************************/

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

  if(await util.getPlaylistEntry(cachedSong, party)) {
    throw 'Song is already in the playlist!';
  }

  // Add song to party
  const entry = new parseObject.PlaylistEntry();
  entry.set("song", cachedSong);
  entry.set("party", party);
  entry.set("numLikes", 0);
  await entry.save();
  await util.updateEntryScore(entry);
  return await util.indicatePlaylistUpdated(party);
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

  const entry = await util.getEntryBySpotifyId(request.params.spotifyId, party);
  if(entry == null) {
    throw 'Song is not in the playlist!';
  }

  await entry.destroy();
  return await util.indicatePlaylistUpdated(party);
});

/**
 * Gets the next song in the playlist, sets it as the currently playing song in
 * the party, then removes the song from the playlist and returns it
 *
 * @throws error if the user is not the admin of their current party or if the
 *         song isn't in the party's playlist
 * @return the song that was removed
 */
Parse.Cloud.define("getNextSong", async (request) => {
  const user = request.user;
  const party = await util.getPartyFromUser(user);
  if(!util.isUserAdmin(user, party)) {
    throw "User is not the admin of their party!";
  }

  const playlist = await util.getPlaylistForParty(user, party);
  if(playlist.length == 0) {
    throw "The playlist is empty";
  }

  const entry = playlist[0];
  const song = entry.get("song");
  await entry.destroy();
  await util.indicatePlaylistUpdated(party);

  party.set("currPlaying", song);
  await party.save();

  return song;
});

/**
 * Sets the song with the given Spotify ID as the currently playing song in
 * the party, then removes the song from the playlist and returns it
 *
 * @param spotifyId the Spotify ID of the song to play
 * @throws error if the user is not the admin of their current party or if the
 *         song isn't in the party's playlist
 * @return the song that was removed
 */
Parse.Cloud.define("setCurrentlyPlaying", async (request) => {
  const user = request.user;
  const party = await util.getPartyFromUser(user);
  if(!util.isUserAdmin(user, party)) {
    throw "User is not the admin of their party!";
  }

  const entry = await util.getEntryBySpotifyId(request.params.spotifyId, party);
  let song;
  if(entry == null) {
    song = await util.getSongById(request.params.spotifyId);

  } else {
    song = await entry.get("song").fetch();
    await entry.destroy();
  }
  await util.indicatePlaylistUpdated(party);

  party.set("currPlaying", song);
  await party.save();

  return song;
}); //TODO - this shouldn't throw an error if song isn't in playlist!

/**
 * This function adds a the current user's like to a playlist entry
 *
 * @param entryId the object ID of the entry to like
 * @throws error if the user is not the in a party, if the song isn't in the
 * party's playlist, or if the user has already liked the song
 * @return the updated playlist?
 */
Parse.Cloud.define("likeSong", async (request) => {
  const user = request.user;
  const party = await util.getPartyFromUser(user);
  const entry = await util.getEntryById(request.params.entryId);
  if(entry == null) {
    throw "That entry does not exist";
  }

  if(!await util.isEntryLikedByUser(entry, user)) {
    const like = new parseObject.Like();
    like.set("user", user);
    like.set("entry", entry);
    await like.save();

    entry.set("numLikes", entry.get("numLikes") + 1)
    await entry.save();
    await util.updateEntryScore(entry);
    return await util.indicatePlaylistUpdated(party, user);
  } else {
    throw 'User has already liked the song!';
  }
});

/**
 * This removes the current user's like from a playlist entry
 *
 * @param entryId the object ID of the entry to like
 * @throws error if the user is not the in a party, if the song isn't in the
 * party's playlist, or if the user has not yet liked the song
 * @return the updated playlist?
 */
Parse.Cloud.define("unlikeSong", async (request) => {
  const user = request.user;
  const party = await util.getPartyFromUser(user);
  const entry = await util.getEntryById(request.params.entryId);
  if(entry == null) {
    throw "That entry does not exist";
  }

  const like = await util.getLike(entry, user);
  if(like == null) {
    throw 'User has not liked the song!';
  }

  await like.destroy();
  entry.set("numLikes", entry.get("numLikes") - 1)
  await entry.save();
  await util.updateEntryScore(entry);
  return await util.indicatePlaylistUpdated(party, user);
});

/**
 * This function gets the playlist of the current user's party
 *
 * There are no parameters for this function
 * @throws error if the user is not in a party
 * @return a list of playlist entries
 */
Parse.Cloud.define("getPlaylist", async (request) => {
  const user = request.user;
  const party = await util.getPartyFromUser(user);
  return await util.getPlaylistForParty(user, party);
});
