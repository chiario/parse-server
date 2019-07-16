// Android push test
// To be used with:
// https://github.com/codepath/ParsePushNotificationExample
// See https://github.com/codepath/ParsePushNotificationExample/blob/master/app/src/main/java/com/test/MyCustomReceiver.java

const Party = Parse.Object.extend("Party");

/**
 * This function creates a new party with the current user as the owner
 *
 * There are no parameters for this function
 */
Parse.Cloud.define("createParty", async (request) => {
  const user = request.user;

  if(user.get("currParty") != null) {
    throw 'Current user already has a party!'
  }

  const party = new Party();
  party.set("admin", user);
  await party.save();

  user.set("currParty", party);
  await user.save(null, {useMasterKey:true});

  return party;
});


/**
 * This function deletes the current user's party if it exists and the user is
 * the party's admin
 *
 * There are no parameters for this function
 */
Parse.Cloud.define("deleteParty", async (request) => {
  const user = request.user;

  const partyPointer = user.get("currParty");
  // check if the current user has a party
  if(partyPointer == null) {
    throw 'Current user does not have a party!'
  }

  // get the user's current party
  const query = new Parse.Query(Party);
  const party = await query.get(partyPointer.id);

  // check if user is party's admin
  if(party.get("admin") == null ||
      party.get("admin").id != user.id) {
    throw 'Current user is not their party\'s admin!'
  }

  // remove the party
  user.set("currParty", null);
  await user.save(null, {useMasterKey:true});
  await party.destroy();

  return user;
});

Parse.Cloud.define('pushChannelTest', function(request, response) {
  // request has 2 parameters: params passed by the client and the authorized user
  var params = request.params;
  var user = request.user;

  var customData = params.customData;
  var launch = params.launch;
  var broadcast = params.broadcast;

  // use to custom tweak whatever payload you wish to send
  var pushQuery = new Parse.Query(Parse.Installation);
  pushQuery.equalTo("deviceType", "android");

  var payload = {};

  if (customData) {
      payload.customdata = customData;
  }
  else if (launch) {
      payload.launch = launch;
  }
  else if (broadcast) {
      payload.broadcast = broadcast;
  }

  // Note that useMasterKey is necessary for Push notifications to succeed.

  Parse.Push.send({
  where: pushQuery,      // for sending to a specific channel
  data: payload,
  }, { success: function() {
     console.log("#### PUSH OK");
  }, error: function(error) {
     console.log("#### PUSH ERROR" + error.message);
  }, useMasterKey: true});

  response.success('success');
});

// iOS push testing
Parse.Cloud.define("iosPushTest", function(request, response) {

  // request has 2 parameters: params passed by the client and the authorized user
  var params = request.params;
  var user = request.user;

  // Our "Message" class has a "text" key with the body of the message itself
  var messageText = params.text;

  var pushQuery = new Parse.Query(Parse.Installation);
  pushQuery.equalTo('deviceType', 'ios'); // targeting iOS devices only

  Parse.Push.send({
    where: pushQuery, // Set our Installation query
    data: {
      alert: "Message: " + messageText
    }
  }, { success: function() {
      console.log("#### PUSH OK");
  }, error: function(error) {
      console.log("#### PUSH ERROR" + error.message);
  }, useMasterKey: true});

  response.success('success');
});
