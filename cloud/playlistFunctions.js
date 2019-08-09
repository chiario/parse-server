/*******************************************************************************
*                                                                              *
*                              PLAYLIST FUNCTIONS                              *
*                                                                              *
*  This class contains all cloud functions that manipulate a party's playlist  *
*                                                                              *
 ******************************************************************************/

const Util = require('./util/utilFunctions.js')
const ParseObject = require('./util/parseObject.js')

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
    const party = await Util.getPartyFromUser(user);
    const song = new ParseObject.Song();
    song.set("artist", request.params.artist);
    song.set("title", request.params.title);
    song.set("album", request.params.album);
    song.set("artUrl", request.params.artUrl);
    song.set("spotifyId", request.params.spotifyId);


    // Save the song to the database
    const cachedSong = await Util.saveSong(song);

    if (await Util.getPlaylistEntry(party, cachedSong.get("spotifyId"))) {
        throw 'Song is already in the playlist!';
    }

    // Add song to party
    const entry = new ParseObject.PlaylistEntry();
    entry.set("song", cachedSong);
    entry.set("party", party);
    entry.set("numLikes", 0);
    entry.set("addedBy", user.get("screenName"));
    Util.updateEntryScore(entry);
    await entry.save();

    await Util.addEntryToPlaylist(party, entry);
});

/**
 * This function removes a song from the current user's party
 *
 * @param spotifyId the spotify ID of the song to remove
 * @throws error if the user is not the admin of their current party or if the
 *         song isn't in the party's playlist
 * @return the playlist entry that was removed
 */
Parse.Cloud.define("removeSong", async (request) => {
    const user = request.user;
    const party = await Util.getPartyFromUser(user);
    if (!Util.isUserAdmin(user, party)) {
        throw "User is not the admin of their party!";
    }

    const entry = await Util.getPlaylistEntry(party, request.params.spotifyId);
    if (entry == null) {
        throw 'Song is not in the playlist!';
    }

    await entry.destroy();
    return await Util.removeEntryFromPlaylist(party, entry);
});

/**
 * This function sets the party's currently playing song.
 *
 * @param spotifyId the Spotify ID of the song that is currently playing
 * @throws error if the user is not the admin of their current party or if the
 *         song isn't in stored in the server
 * @return the current party
 */
Parse.Cloud.define("setCurrentlyPlayingSong", async (request) => {
    const user = request.user;
    const party = await Util.getPartyFromUser(user);
    if (!Util.isUserAdmin(user, party)) {
        throw "User is not the admin of their party!";
    }

    const song = await Util.getSongById(request.params.spotifyId);
    if (song == null) {
        throw "That song does not exist";
    }
    party.set("currPlaying", song);
    await party.save();

    return song;
});

/**
 * This function sets the party's currently playing song, deletes it from the
 * playlist, and returns it.
 *
 * @param spotifyId the spotify ID of the song to set as currently playing
 * @throws error if the user is not the admin of their current party or if the
 *         song isn't in the party's playlist
 * @return the current party
 */
Parse.Cloud.define("setCurrentlyPlayingEntry", async (request) => {
    const user = request.user;
    const party = await Util.getPartyFromUser(user);
    if (!Util.isUserAdmin(user, party)) {
        throw "User is not the admin of their party!";
    }

    const entry = await Util.getPlaylistEntry(party, request.params.spotifyId);
    if (entry == null) {
        throw 'Song is not in the playlist!';
    }

    const song = entry.get("song");
    party.set("currPlaying", song);

    await entry.destroy();
    await Util.removeEntryFromPlaylist(party, entry);
    return song;
});

/**
 * This function adds a the current user's like to a playlist entry
 *
 * @param spotifyId the spotify ID of the entry to like
 * @throws error if the user is not the in a party, if the song isn't in the
 * party's playlist, or if the user has already liked the song
 * @return the updated playlist?
 */
Parse.Cloud.define("likeSong", async (request) => {
    const user = request.user;
    const party = await Util.getPartyFromUser(user);
    const entry = await Util.getPlaylistEntry(party, request.params.spotifyId);
    if (entry == null) {
        throw "That entry does not exist";
    }

    if (!await Util.isEntryLikedByUser(entry, user)) {
        const like = new ParseObject.Like();
        like.set("user", user);
        like.set("entry", entry);
        await like.save();

        entry.set("numLikes", entry.get("numLikes") + 1)
        Util.updateEntryScore(entry);
        await entry.save();

        await Util.indicatePlaylistUpdated(party);
        return like;
    } else {
        throw 'User has already liked the song!';
    }
});

/**
 * This removes the current user's like from a playlist entry
 *
 * @param spotifyId the spotify ID of the entry to unlike
 * @throws error if the user is not the in a party, if the song isn't in the
 * party's playlist, or if the user has not yet liked the song
 * @return the updated playlist?
 */
Parse.Cloud.define("unlikeSong", async (request) => {
    const user = request.user;
    const party = await Util.getPartyFromUser(user);
    const entry = await Util.getPlaylistEntry(party, request.params.spotifyId);
    if (entry == null) {
        throw "That entry does not exist";
    }

    const like = await Util.getLike(entry, user);
    if (like == null) {
        throw 'User has not liked the song!';
    }

    await like.destroy();
    entry.set("numLikes", entry.get("numLikes") - 1)
    await Util.updateEntryScore(entry);
    await entry.save();

    await Util.indicatePlaylistUpdated(party);
    return like;
});

/**
 * This function gets the playlist of the current user's party
 *
 * There are no parameters for this function
 * @throws error if the user is not in a party
 * @return a list of playlist entries
 */
Parse.Cloud.define("getCachedPlaylist", async (request) => {
    const user = request.user;
    const party = await Util.getPartyFromUser(user);
    const playlist = await Util.getCachedPlaylist(party);
    return Util.getPlaylistAsString(playlist);
});

/**
 * This function gets a current user's likes
 *
 * There are no parameters for this function
 * @throws error if the user is not in a party
 * @return a list of likes
 */
Parse.Cloud.define("getLikes", async (request) => {
    const user = request.user;
    return await Util.getLikesForUser(user);
});

Parse.Cloud.afterDelete(ParseObject.PlaylistEntry, async (request) => {
    Util.cleanupLikes(request.object);
})
