/*******************************************************************************
*                                                                              *
*                                 SPOTIFY API                                  *
*                                                                              *
* This class contains all methods that directly interface with the Spotify API *
*                                                                              *
 ******************************************************************************/
const request = require('request-promise-native'); // "Request" library

module.exports = {
  getAccessToken: async function() {
    // build the token request
    var authOptions = {
      method: 'POST',
      uri: 'https://accounts.spotify.com/api/token',
      headers: {
        'Authorization': 'Basic ' + (new Buffer(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64'))
      },
      form: {
        grant_type: 'client_credentials'
      },
      json: true
    };

    return await request(authOptions);
  },

  search: async function(token, query, limit) {
    // build the search request
    var options = {
      uri: 'https://api.spotify.com/v1/search',
      qs: {
        q: query,
        type: 'track', // TODO: don't hard code this?
        limit: limit
      },
      headers: {
        'Authorization': 'Bearer ' + token
      },
      json: true
    };

    return await request(options);
  }

};
