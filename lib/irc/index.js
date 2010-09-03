var sys = require('sys');
var profiles = require('../../config').profiles;

var irc = require('./irc');
var clients = [];

var events = require("events");
var emitter = new events.EventEmitter();
exports.api = emitter;

exports.send = function(client) {
  arguments = Array.prototype.slice.call(arguments);
  arguments.shift();
  client.send.apply(client, arguments);
};
exports.sendPM = function(client, nick, message) {
  client.send.call(client, "PRIVMSG", nick, ":" + message);
};
exports.sendMessage = function(client, channel, message, nick) {
  if ("string" === typeof nick)
    client.send.call(client, "PRIVMSG", channel, ":" + nick + ": " + message);
  else
    client.send.call(client, "PRIVMSG", channel, ": " + message);
};
exports.join = function(client, channel) {
  client.send.call(client, 'JOIN', channel);
};
exports.part = function(client, channel, message) {
  if ("string" !== typeof message)
    message = "Leaving.";

  client.send.call(client, "PART", channel, ":" + message);
};
exports.kick = function(client, channel, nick, message) {
  if ("string" !== typeof message)
    message = client.profile.nick;

  client.send.call(client, 'KICK', channel, nick, ":" + message);
};

for (var i = 0, il = profiles.length; i < il; i++) {
  clients[i] = new irc.Client(profiles[i].host, profiles[i].port);
  clients[i].profile = profiles[i];
  clients[i].channels = {};

  if (clients[i].profile.channels instanceof Array)
  for (var j = 0, jl = clients[i].profile.channels.length; j < jl; j++)
    clients[i].channels[clients[i].profile.channels[j]] = false;

  clients[i].addListener('001', on001);
  clients[i].addListener('JOIN', onJoin);
  clients[i].addListener('PART', onPart);
  clients[i].addListener('QUIT', onQuit);
  clients[i].addListener('KICK', onKick);
  clients[i].addListener('INVITE', onInvite);
  clients[i].addListener('DISCONNECT', onDisconnect);
  clients[i].addListener('PRIVMSG', onPrivMsg);

  clients[i].connect(
    clients[i].profile.nick,
    clients[i].profile.user || 'guest',
    clients[i].profile.real || 'Guest',
    clients[i].profile.password || null
  );
}

function on001() {
  if (this.timeout) {
    clearTimeout(this.timeout);
    this.timeout = null;
  }

  emitter.emit("connect", this);

  for (key in this.channels)
    this.send('JOIN', key);

  key = null;
}

function onJoin(user, channel) {
  try {
    user = user.substr(1).split("!")[0];
  } catch ( error ) {
    return;
  }
  if (this.profile.nick === user) {
    this.channels[channel] = true;
    emitter.emit("join", this, channel);
  }
  else
    emitter.emit("userjoin", this, channel, user);
}

function onPart(user, channel, message) {
  try {
    user = user.substr(1).split("!")[0];
  } catch ( error ) {
    return;
  }
  if (this.profile.nick !== user)
    emitter.emit("userpart", this, channel, user, message);
}

function onQuit(user, message) {
  try {
    user = user.substr(1).split("!")[0];
  } catch ( error ) {
    return;
  }
  if (this.profile.nick !== user)
    emitter.emit("userquit", this, user, message);
}

function onKick(user, channel, nick, message) {
  try {
    user = user.substr(1).split("!")[0];
  } catch ( error ) {
    return;
  }
  if (this.profile.nick === nick)
    emitter.emit("kicked", this, channel, message, user);
  else
    emitter.emit("userkicked", this, channel, nick, message, user);
}

function onInvite(user, nick, channel) {
  try {
    user = user.substr(1).split("!")[0];
  } catch ( error ) {
    return;
  }
  emitter.emit("invite", this, channel, user);
}

function onDisconnect() {
  for (key in this.channels)
    this.channels[key] = false;

  emitter.emit("disconnect", this);

  sys.puts("Reconnecting " + this.profile.host + " in 15s");
  setTimeout(function(client) {
    sys.puts("Trying to connect ...");

    client.connect(
      client.profile.nick,
      client.profile.user || 'guest',
      client.profile.real || 'Guest'
    );

    client.timeout = setTimeout(function() {
      sys.puts("Re-connect timeout");
      client.disconnect();
      client.emit('DISCONNECT', 'timeout');
    }, 15000, client);
  }, 15000, this);
}

function onPrivMsg(prefix, channel, text) {
  // PRIVMSG to profile
  if (this.profile.nick === channel) {
    try {
      var nick = prefix.substr(1).split("!")[0];
    } catch ( error ) {
      return;
    }

    emitter.emit("pm", this, text, nick);
  }

  // PRIVMSG in channel
  else {
    try {
      var nick = prefix.substr(1).split("!")[0];
    } catch ( error ) {
      var nick = null;
    }

    emitter.emit("message", this, text, channel, nick);
  }
}

i = il = j = jl = null;
