// IRC bot config

exports.profiles = [{
	host: "irc.moofspeak.net",
	port: 6667,
	nick: 'ircbot',
	password: null, // null is no password, otherwise a string
	user: 'ircbot',
	real: 'IRC Bot',
	channels: ["#testbot", "#anotherchannel"]
}, {
	host: "irc.freenode.net",
	port: 6667,
	nick: 'ircbot',
	password: null,
	user: 'ircbot',
	real: 'IRC bot',
	channels: ["#v8bot"]
}];