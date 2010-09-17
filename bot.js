var irc = require('./lib/irc');
var api = irc.api;

var sys = require('sys'),
	Sandbox = require("./lib/sandbox"),
	//HTTP Client requires
	http = require("http"),
	events = require("events"),
	url = require('url'),
	path = require('path'),
	fs = require('fs');

var Script = process.binding('evals').Script;

rateLimit = { "beers":{} };

//Error handler - Catch exceptions so you don't crash the bot!
process.addListener("uncaughtException", function(err) { sys.puts("Error: " + err + "\n"); return true; });

/*******************************SHORTCUT FUNCTIONS*******************************/
function serialize(o) {
	//if (o.toSource) return o.toSource();
	switch (typeof o) {
		case 'number':
		case 'boolean':
		case 'function':
			return o.toString();
		case 'string':
			return "\"" + o + "\"";
		case 'undefined':
			return undefined;
		case 'object':
			var s = "";
			if (~o.constructor.toString().indexOf("Array")) {
				if (!o.length) s = "[]";
				else {
					s = '[';
					for (var i=0,l=o.length-1;i<l;i++) s += serialize(o[i]) + ', ';
					s += serialize(o[i]) + ']';
				}
			}else {
				s = '{';
				for (var key in o) s += "\"" + key + "\": " + serialize(o[key]) + ', ';
				s = s.replace(/,\s*$/, '') + '}';
			}
			return s;
		default:
			return null;
	}
}

/*******************************INI FUNCTIONS*******************************/
function iniSet(file, item, value, callback) {
	fs.readFile(file, function(err, data) {
		if (err) return false;

		data = data + ""; //Faster toString()

		var _data = data.split("\n"), __data, found = false;
		for (var i=0,l=data.length;i<l;i++) {
			if (!_data[i]) continue; //Skip blank lines

			__data = /([^=]+)=(.*)/.exec(_data[i]);
			if (__data && __data.length >= 3) {
				if (__data[1] === item) {
					_data[i] = item.replace(/[\\r\\n\r\n]/g, "") + "=" + value;
					found = true;
					break;
				}
			}
		}
		if (!found) _data.push(item + "=" + value);

		fs.writeFile(file, _data.join("\n"), function(err) {
			if (err) return false;

			callback instanceof Function && callback();
		});
	});
}
function iniGet(file, item, callback) {
	fs.readFile(file, function(err, data) {
		if (err) return false;

		data = data + ""; //Faster toString()

		var _data = data.split("\n"), __data;
		for (var i=0,l=data.length;i<l;i++) {
			if (!_data[i]) continue; //Skip blank lines

			__data = /([^=]+)=(.*)/.exec(_data[i]);
			if (__data && __data.length >= 3) {
				if (__data[1] === item) {
					callback instanceof Function && callback(__data[2]);
					return false;
				}
			}
		}
		callback instanceof Function && callback();
	});
}

/*******************************EXECUTE COMMANDS*******************************/

function runCode(msg, client, nick, channel, private, format, echo) {
	if (echo === undefined) echo = true;

	(new Sandbox()).run(msg, function(out) {
		//Filter long strings
		if (out.length > 400) out = out.substring(0,400) + " [Output truncated...]";
		var outSplit = out.split(/\r?\n/g);
		if (outSplit.length > 5) for (var i=0, out = "";i<5;i++) out += outSplit[i] + "\n";

		if (outSplit.length > 1) {
			//Send chunked message
			var t = setInterval(function() {
				if (count++ < Math.min(5,outSplit.length)) {
					if (echo) {
						if (private) irc.sendPM(client, nick, outSplit[i]);
						else irc.sendMessage(client, channel, outSplit[i], nick);
					}
				}else {
					if (outSplit.length > 5) {
						if (echo) {
							if (private) irc.sendPM(client, nick, "[Output truncated...]");
							else irc.sendMessage(client, channel, "[Output truncated...]", nick);
						}
					}
					clearInterval(t);
				}
			}, 5000), count = 0;
		}else {
			//If no formatting, trim string quotation marks
			if (!format) out = out.replace(/^['"]|['"]$/g, "");

			//Send regular message (no chunks)
			if (echo) {
				if (private) irc.sendPM(client, nick, out);
				else irc.sendMessage(client, channel, out, nick);
			}
		}
	});
}

function runCommand(c, msg, client, message, channel, nick, private) {
	//`v commands
	vCommands = {
		"google":function(toNick, site, command, append) {
			var regex = new RegExp("(?:" + ["google", command || undefined].join("|") + ")\s*(.*)", "i");

			var gQuery = regex.exec(msg);

			if (gQuery && gQuery.length > 1) ~msg.indexOf("@") ? gQuery = encodeURIComponent(/(.*)\s*@/.exec(gQuery[1])[1]) : gQuery = encodeURIComponent(gQuery[1]);
			else return false;

			if (site) gQuery += "+" + "site%3A" + encodeURIComponent(site);

			var google = http.createClient(80, 'ajax.googleapis.com');
			var search_url = "/ajax/services/search/web?v=1.0&q=" + gQuery + (append ? "%20" + encodeURIComponent(append) : "");
			var request = google.request('GET', search_url, {
				'host': 'ajax.googleapis.com',
				'Referer': 'http://www.v8bot.com',
				'User-Agent': 'NodeJS HTTP client',
				'Accept': '*/*'});
			request.addListener('response', function(response) {
				response.setEncoding('utf8');
				var body = "";
				response.addListener('data', function(chunk) { body += chunk; });
				response.addListener('end', function() {
					var searchResults = JSON.parse(body);
					var results = searchResults["responseData"]["results"];

					if (private) irc.sendPM(client, nick, results[0]["titleNoFormatting"].replace(/&#(\d+);/g, function(a, b){ return String.fromCharCode(b) }) + " - " + results[0]["url"]);
					else irc.sendMessage(client, channel, results[0]["titleNoFormatting"].replace(/&#(\d+);/g, function(a, b){ return String.fromCharCode(b) }) + " - " + results[0]["url"], toNick);
				});
			});
			request.end();
		},
		//Return first GitHub result
		"git":function(toNick) {
			vCommands["google"](toNick, "http://github.com", "git");
		},
		//Return first StackOverflow result
		"sf":function(toNick) {
			vCommands["google"](toNick, "http://stackoverflow.com", "sf");
		},
		"commands":function() {
			var cmdOut = [];
			for (var i in vCommands) cmdOut.push(i);

			cmdOut.sort();

			return "Commands: Type `v <command>.  Optionally, type `v <command> @ <nick> to send to a specific user. \
				`v Commands are: " + cmdOut.join(", ") + ". Other commands: v8, `re, `pcre, `ref.  Type `v help <command> for more information.";
		},
		"about":function() {
			return "v8bot is an IRC bot written entirely in Javascript using Google's v8 Javascript engine and Node.js.  Credits: eisd, Tim_Smart, gf3, MizardX";
		},
		"beers":function() {
			var p = /beers\s*(.*)/i.exec(msg);

			p.length > 1 && iniGet("beer.txt", p[1], function(s) {
				s = s >> 0; //String to number
				if (private) irc.sendPM(client, nick, p[1] + " has " + s + " beers.");
				else irc.sendMessage(client, channel, p[1] + " has " + s + " beers.", nick);
			});
		},
		"macro":function() {
			if (~msg.indexOf("=")) {
				var p = /macro\s*([\w\x20]+)\s*=\s*(.*)/i.exec(msg);

				if (p && p.length >= 3) {
					var p1_trim = p[1].replace(/^\s*|\s*$/g, ""); //Trim whitespace
					iniSet("macros.txt", p1_trim, p[2], function() {
						if (private) irc.sendPM(client, nick, "Saved macro \"" + p1_trim + ".\"  Type `v " + p1_trim + " to execute.");
						else irc.sendMessage(client, channel, "Saved macro \"" + p1_trim + ".\"  Type `v " + p1_trim + " to execute.", nick);
					});
				}
			}else {
				var p = /macro\s*(.*)/.exec(msg);

				if (p && p.length > 1) {
					var p1_trim = p[1].replace(/^\s*|\s*$/g, ""); //Trim whitespace
					iniGet("macros.txt", p1_trim, function(s) {
						if (!s) s = "Macro does not exist.";

						if (private) irc.sendPM(client, nick, "\"" + p1_trim + "\" Macro Code: " + s);
						else irc.sendMessage(client, channel, "\"" + p1_trim + "\" Macro Code: " + s, nick);
					});
				}
			}
		},
		"help":function(toNick) {
			var p = /help\s*(.*)/i.exec(msg);
			var man = {
				"google":"Use \"`v google <search query>\" to perform a quick Google search. Only the first result will be returned. \
					Also, append \"@ <nick>\" to direct the result to a specific user.",
				"macro":["v8bot incorporates a very powerful macro feature so you can write custom commands for v8bot. \
					Anyone can add macros/custom commands to v8bot.  v8bot macros can return anything from a simple message or even \
					execute full Javascript code.  To save a macro, type \"`v macro <MacroName> = <code>\". \
					To view an existing macro's code, type \"`v macro <MacroName>\".  To execute a macro, type \"`v <MacroName>\" \
					or \"`v <MacroName> @ <nick>\"",
					"When writing macro code, you can incorporate arguments. \
					Use <args> for all arguments. Use <arg 1>, <arg 2>, etc. for specific arguments. \
					<args> will be joined by commas, but <arg 1>, <arg 2>, etc. will be sent as literals. \
					Example: \"`v macro foo = (function(){ return arguments.length })(<args>)\"",
					"To execute a macro with arguments, use \"`v <MacroName> arg1 arg2 arg3\" \
					Example: \"`v macro foo 1 2 3\"",
					"All alphanumeric arguments will be converted to a string literal even if quotation marks are not provided. \
					Example: \"`v macro foo 1 bar\" - <arg 1> will be a number, <arg 2> will be a string literal \"bar\""],
				"beers":"Type nick++ to give a beer to a user (usually as a way to say \"thanks\").  Type nick-- to take a beer away from a user. \
					Type \"`v beers <nick>\" to get the number of beers for a specific user.",
				"git":"Searches GitHub and returns the first result. Usage: `v git <search>. Optionally: `v git <search> @ <nick>",
				"sf":"Searches Stack Overflow and returns the first result. Usage: `v sf <search>. Optionally: `v sf <search> @ <nick>",
				"v8":"The \"v8\" command evaluates Javascript code using Google's ultra-fast V8 Javascript Engine.  Use \"v8: code\", \
					\"v8> code\", or \"v8 code\"",
				"`re":"The \"`re\" command evaluates regular expressions. Usage: `re text /regex/flags",
				"`pcre":"The \"`pcre\" command evaluates regular expressions with the PCRE library. Usage: `pcre text /regex/flags",
				"`ref":["Uses Google search on authority websites to return a link for a specific topic. For example, the Javascript \
					reference will provide only results from MDC.  The RegExp reference will only provide results from regular-expressions.info",
					"Currently supported references: js, jquery, regex, perl, php, java, mdc, w3c, html, css, dom",
					"Usage: `ref <language> <search>",
					"Example: `ref js array *or* `ref regex groups"]
			};

			if (p && p.length > 1) ~msg.indexOf("@") ? p = /(.*)\s*@/.exec(p[1])[1].replace(/^\s*|\s*$/g, "") : p = p[1];
			else return false;

			p = p.toLowerCase(); //Case-insensitive lookup

			if (man[p]) {
				if (man[p] instanceof Array) {
					//Send first chunk immediately
					if (private) irc.sendPM(client, nick, p + " Command: " + man[p][0].replace(/^\s+/, ""));
					else irc.sendMessage(client, channel, p + " Command: " + man[p][0].replace(/^\s+/, ""), toNick);

					//Send chunked message
					var t = setInterval(function() {
						if (count++ < Math.min(5, man[p].length - 1)) {
							if (private) irc.sendPM(client, nick, man[p][count].replace(/^\s+/, ""));
							else irc.sendMessage(client, channel, man[p][count].replace(/^\s+/, ""), toNick);
						}else {
							if (man[p].length > 5) {
								if (private) irc.sendPM(client, nick, "[Output truncated...]");
								else irc.sendMessage(client, channel, "[Output truncated...]", toNick);
							}
							clearInterval(t);
						}
					}, 5000), count = 0;
				}else {
					if (private) irc.sendPM(client, nick, p + " Command: " + man[p].replace(/^\s+/, ""));
					else irc.sendMessage(client, channel, p + " Command: " + man[p].replace(/^\s+/, ""), toNick);
				}
			}else {
				if (p === "") {
					if (private) irc.sendPM(client, nick, "For a list of commands, type \"`v commands\".  For help on a specific command, type \"`v help <command>\".");
					else irc.sendMessage(client, channel, "For a list of commands, type \"`v commands\".  For help on a specific command, type \"`v help <command>\".", toNick);
				}else {
					if (private) irc.sendPM(client, nick, "No manual page for this command.");
					else irc.sendMessage(client, channel, "No manual page for this command.", toNick);
				}
			}
		}
	};

	var commands = {
		//V8 Javascript VM Code Execution
		"v8":function() {
			//Commented out below code because it doesn't sandbox against infinite loops
			/*var code = /(.*);|(.*)/.exec(msg)[0];
			var output = msg.replace(/(.*);/, "");
			var sandbox = {};
			var send = (function() {
				try {
					Script.runInNewContext(code, sandbox);
					return Script.runInNewContext(output, sandbox);
				}catch(error) {
					return error.message;
				}
			})();

			var sendCtor = send.constructor.toString().toLowerCase(); //instanceof/constructor don't work due to different context

			if (~sendCtor.indexOf("string")) send = "\"" + send + "\"";
			else if (~sendCtor.indexOf("array")) send = "[" + send.join(", ") + "]";

			irc.sendMessage(client, channel, send, nick);*/

			runCode(msg, client, nick, channel, private, true);
		},
		//`v Commands
		"`v":function() {
			var subcommand = /^\x20*([^\x20]*)\x20*(.*)/.exec(msg), /*Declare temp vars-->*/ _, __;

			if (subcommand && subcommand.length > 1 && (_ = subcommand[1].toLowerCase())) {
				//Parse out @ nick
				var toNick = subcommand[2] ? ( (__ = /[^@]*@\s*(.*)/.exec(subcommand[2])) && __.length > 1 ? __[1] : nick ) : nick;

				return vCommands[_] ? (function() { //`v command exists, execute it
					if (~["google", "beers", "macro", "help", "regex", "git", "sf"].indexOf(_)) vCommands[_](toNick);
					else {
						if (private) irc.sendPM(client, nick, vCommands[_]());
						else irc.sendMessage(client, channel, vCommands[_](), toNick);
					}

					return true;
				})() : (function() { //`v command does not exist, search macros and execute
					iniGet("macros.txt", _, function(s) {
						if (s) {
							//Pass arguments?
							/*if (subcommand[2].indexOf("[") < subcommand[2].lastIndexOf("]") && subcommand[2]) {
								var args = /\[(.*)]/.exec(subcommand[2]);

								if (args && args.length > 1) {
									s = s.replace(/<args>/g, args[1]).replace(/<arg\x20(\d+)>/g, function(a,b) {
										return args[1].replace(/^\[|]$/g, "").split(",")[b-1];
									});
								}
							}else {
								var args = subcommand[2].replace(/^\s*|\s*$/g, "").split(" ");
								if (args && args.length >= 1) {
									if (args.length == 1) { //Comma-delimited arguments
										s = s.replace(/<args>/g, args).replace(/<arg\x20(\d+)>/g, function(a,b) {
											return args.join(" ").split(",")[b-1];
										});
									}else { //Spaced arguments
										s = s.replace(/<args>/g, args).replace(/<arg\x20(\d+)>/g, function(a,b) {
											return "\"" + args[b-1] + "\"";
										});
									}
								}
							}*/

							//Extract all args between quotes or split by spaces.  Must fix: JS does not allow look-behinds so we try to find best match with lookaheads only \S+(?!\s*['"])
							if (subcommand[2]) var args = subcommand[2].match(/'(?:\\.|[^\\'])*'|"(?:\\.|[^\\"])*"|\S+(?!\s*['"])/g);//.filter(function(s){ return s !== "" });

							//Format arguments before passing <args>
							var formatArgs = args ? args.map(function(x){ 
								if (x.match(/^(?!\d+$)\w+$/)) return "\"" + x + "\""
								else return x;
							}) : [];

							s = s.replace(/<args>/g, formatArgs.join(",")).replace(/<arg\x20(\d+)>/g, function(a,b) {
								var c = args[b-1];

								//Replace all alphanumeric strings with quotes unless it's a number only
								if (c.match(/^(?!\d+$)\w+$/)) return "\"" + c + "\"";
								else return c;
							});

							runCode(s, client, toNick, channel, private, false);
						}else {
							if (private) irc.sendPM(client, nick, "No such command.");
							else irc.sendMessage(client, channel, "No such command.", nick);
						}
					});
				})();
			}
		},
		//`re Regex Command
		"`re":function() {
			var parseRegex = (~msg.indexOf("@") ? /(.*)\s+@\s+(\S+)$/.exec(msg) : msg), toNick = nick;
			if (parseRegex instanceof Array && parseRegex.length > 1) {
				toNick = parseRegex[2];
				parseRegex = parseRegex[1];
			}

			var mre = /^(.*)\s(?:m|(?=\/))([^\w\s\\])((?:\\.|(?!\2)[^\\])*)\2([a-z]*)\s*$/.exec(parseRegex);
			var sre = /^(.*)\ss([^\w\s\\])((?:\\.|(?!\2)[^\\])*)\2((?:\\.|(?!\2)[^\\])*)\2([a-z]*)\s*$/.exec(parseRegex);

			if (mre && mre.length >= 4) {
				var s = mre[1], r = mre[3], f = mre[4], out = [], m;

				if (~f.toLowerCase().indexOf("g")) {
					var gRegex = RegExp(r, f);

					out = serialize(s.match(gRegex) || "No matches found.");
					//while ((m = gRegex.exec(s)) != null) out.push(m[0]);

					out = serialize(out);
				} else {
					var regOut = RegExp(r, f).exec(s);
					if (regOut) out = serialize(regOut);
					else out = "No matches found.";
				}

				if (private) irc.sendPM(client, nick, out);
				else irc.sendMessage(client, channel, out, toNick);
			} else if (sre && sre.length >= 4) {
				var s = sre[1], r = sre[3], u = sre[4], f = sre[5], out = [], m;

				var gRegex = RegExp(r, f);
				out = serialize(s.replace(gRegex,u));

				if (private) irc.sendPM(client, nick, out);
				else irc.sendMessage(client, channel, out, toNick);
			} else {
				if (private) irc.sendPM(client, nick, "Invalid syntax. Usage: `re text /regex/flags");
				else irc.sendMessage(client, channel, "Invalid syntax. Usage: `re text /regex/flags", toNick);
			}
		},
		//`pcre Perl-Compatible Regular Expressions Command
		"`pcre":function() {
			var parseRegex = (~msg.indexOf("@") ? /(.*)\s+@\s+(\S+)$/.exec(msg) : msg), toNick = nick;
			if (parseRegex instanceof Array && parseRegex.length > 1) {
				toNick = parseRegex[2];
				parseRegex = parseRegex[1];
			}

			var mre = /^(.*)\s(?:m|(?=\/))([^\w\s\\])((?:\\.|(?!\2)[^\\])*)\2([a-z]*)\s*$/.exec(parseRegex);

			//If input is valid, send data
			if (mre && mre.length >= 4) {
				var pcretest = require('child_process').spawn("pcretest"), out = "", timer, error = "";

				//Listen for data
				//var flag_re = false, flag_data = false;
				function getData(s) {
					s = s + "";

					//Input regex pattern
					/*if (~s.indexOf("re>") && !flag_re) {
						pcretest.stdin.write('/' + mre[3] + '/' + mre[4]);
						pcretest.stdin.write("\n");

						flag_re = true;
					}
					//Input string
					else if (~s.indexOf("data>") && !flag_data) {
						pcretest.stdin.write(mre[1]);
						pcretest.stdin.write("\n");

						flag_data = true;
					}
					//Get output and exit
					else */if (!!s) {
						out += s.replace(/re>|data>/g, "");

						if (~s.toLowerCase().indexOf("failed") && !~s.indexOf("data>")) error = /failed:.*/i.exec(s).pop();

						pcretest.stdin.end();
					}
				}
				pcretest.stdout.addListener("data", getData);

				//Return output
				pcretest.addListener("exit", function() {
					clearTimeout(timer);

					//Format output
					if (out) {
						//out = "[" + out.replace(/^\s+|\s+$/g, "").replace(/\n/g, ", ").replace(/\s+/g, " ").replace(/(\d+):\x20+/g, "($1): ") + "]";
						out = out.split(/\n/g).filter(function(x){ return !!/\d+:\x20+/.test(x) }).map(function(x){ return x.replace(/^\s+|\s+$/g, "").replace(/^\d+:\x20*/, "") });

						if (error) out = error;
						else if (out.length === 1) out = "No matches found.";
						else out = serialize((out.shift(), out));

						if (private) irc.sendPM(client, nick, out);
						else irc.sendMessage(client, channel, out, toNick);
					}
				});

				/***This is NOT a test.  Do NOT remove the below lines. Dummy data needs to be sent to pcretest for Node to do I/O correctly***/
				pcretest.stdin.write("/(?:)/\n");
				pcretest.stdin.write("x\n");
				pcretest.stdin.write("\n");
				pcretest.stdin.write("\n");
				/***The above lines are NOT a test. Do NOT remove the above lines.**********************/

				//Input regex pattern and string
				pcretest.stdin.write('/' + mre[3] + '/' + mre[4]);
				pcretest.stdin.write("\n");
				pcretest.stdin.write(mre[1]);
				pcretest.stdin.write("\n");

				timer = setTimeout(function() {
					pcretest.stdout.removeListener("data", getData);
					pcretest.kill();

					if (private) irc.sendPM(client, nick, "Error: Timeout.");
					else irc.sendMessage(client, channel, "Error: Timeout.", toNick);
				}, 10000);
			}else {
				if (private) irc.sendPM(client, nick, "Invalid syntax. Usage: `pcre text /regex/flags");
				else irc.sendMessage(client, channel, "Invalid syntax. Usage: `pcre text /regex/flags", toNick);
			}
		},
		//`ref Commands
		"`ref":function() {
			var p = (~msg.indexOf("@") ? /(.*)\s*@\s*(.*)/.exec(msg) : msg), toNick = nick;
			if (p instanceof Array && p.length > 1) {
				toNick = p[2];
				p = p[1].replace(/^\s*|\s*$/g, "");
			}

			//Whitelist channels
			if (~["#regex", "#v8bot", "##javascript"].indexOf(channel) || private) {
				var c = p.split(" ");
				if (c && c.length > 1) c = c[0];
				else {
					if (private) irc.sendPM(client, nick, "No such command.");
					else irc.sendMessage(client, channel, "No such command.", nick);

					return false;
				}

				if (c === "regex") vCommands["google"](toNick, "http://www.regular-expressions.info", c);
				else if (c === "js" || c === "mdc") vCommands["google"](toNick, "https://developer.mozilla.org", c);
				else if (c === "perl") vCommands["google"](toNick, "http://perldoc.perl.org", c);
				else if (c === "jquery") vCommands["google"](toNick, "http://api.jquery.com", c);
				else if (c === "php") vCommands["google"](toNick, "http://php.net", c);
				else if (c === "java") vCommands["google"](toNick, "http://java.sun.com", c);
				else if (c === "w3" || c === "w3c") vCommands["google"](toNick, "http://www.w3.org", c);
				else if (c === "dom") vCommands["google"](toNick, "http://reference.sitepoint.com", c, "inurl:javascript");
				else if (c === "html") vCommands["google"](toNick, "http://reference.sitepoint.com", c, "inurl:html");
				else if (c === "css") vCommands["google"](toNick, "http://reference.sitepoint.com", c, "inurl:css");
			}
		},
		"help":function() {
			//Private message only
			if (private) irc.sendPM(client, nick, "Type \"`v commands\" for a list of v8bot commands. \
						Type \"`v help <command>\" for specific command help topics. \
						Join #v8bot for more support.");
		}
	};

	return commands[c] instanceof Function ? commands[c]() : false;
}

/*******************************EVENT LISTENERS*******************************/

api.addListener("connect", function(client) {
	// Connect to server
	//sys.puts(sys.inspect(arguments));
});

api.addListener("join", function(client, channel) {
	// Joined a channel
	//sys.puts(sys.inspect(arguments));

	//irc.sendMessage(client, "Hi there", "#v8bot", "#v8bot");
});

api.addListener("disconnect", function(client) {
	// Disconnected from server. The bot will
	// automatically try to re-connect.
	// "connect" event will fire when re-connected
	//sys.puts(sys.inspect(arguments));
});

api.addListener("invite", function(client, channel, nick) {
	// Bot was invited to a channel
	//sys.puts(sys.inspect(arguments));
});

api.addListener("pm", function(client, message, nick) {
	// Private message sent to profile
	//sys.puts(sys.inspect(arguments));

	var c = /([^\x20:>]*)(?:[:>]?\x20*)(.*)/.exec(message), msg;

	//Parse message
	if (!c) return false;
	msg = c.length ? c[2] : null;
	c = c.length ? c[1] : null;

	/*if (false) { //Need to add check for admin
		//Admin commands - Send to channel
		if (c === "@send") { //Send message to channel
			var p = /(#[^\s]*)\s+(.*)/.exec(msg);
			if (p.length < 3) {
				irc.sendPM(client, nick, "Invalid command.");
				return false;
			}

			irc.sendMessage(client, p[1], p[2]);
			irc.sendPM(client, nick, "Sent <" + p[2] + "> to <" + p[1] + ">");
		}else if (c === "@join") { //Join channel
			irc.join(client, msg);

			irc.sendPM(client, nick, "Joined " + msg);
		}else if (c === "@leave") {
			irc.part(client, msg, "");

			irc.sendPM(client, nick, "Left " + msg);
		}
	}*/

	runCommand(c, msg, client, message, null, nick, true, true);
});

api.addListener("message", function(client, message, channel, nick) {
	if (/(v8bot)\s*[:>]/.exec(message)) irc.sendMessage(client, channel, "Use v8: <code> to evaluate code or \"`v commands\" for a list of v8bot commands.", nick);

	//Split message
	var c = /([^\x20:>]*)(?:[:>]?\x20*)(.*)/.exec(message), msg;

	//Parse message
	if (!c) return false;
	msg = c.length ? c[2] : null;
	c = c.length ? c[1] : null;

	// Message sent to channel
	if (c) {
		//Parse nick++, nick--
		var r = /^\s*~?([\w-|\[\]`]*)(\+\+|--)\s*$/.exec(message);
		var blacklistChannels = ["##javascript", "#regex"];

		if (r && r.length > 1 && r[1] && r[2]) {
			var limit = rateLimit.beers[r[1]];

			if (nick === r[1]) {
				irc.sendMessage(client, channel, "Don't cheat!  You can't give a beer to yourself.", nick);
				return false;
			}

			if ( (limit && +new Date > +new Date(+limit + 60000)) || !limit ) { //Rate limit check - 1 minute
				if (rateLimit.beers[r[1]]) rateLimit.beers[r[1]] = null; //Remove rate limit

				iniGet("beer.txt", r[1], function(s) {
					s = s >> 0; //String to number

					var action, action2;
					if (r[2] === "++") { //Add beers
						action = "given";
						action2 = "to";
						s++;
					}else if (r[2] === "--") { //Subtract beers
						action = "taken";
						action2 = "from";
						s--;
					}

					iniSet("beer.txt", r[1], s, function() {
						rateLimit.beers[r[1]] = +new Date;
						!~blacklistChannels.indexOf(channel) && irc.sendMessage(client, channel, 
							nick + " has " + action + " a beer " + action2 + " " + r[1] + ". \
							" + r[1] + " now has " + s + " beers.");
					});
				});
			}else {
				!~blacklistChannels.indexOf(channel) && irc.sendMessage(client, channel, r[1] + " is getting too many beers.  Don't let " + r[1] + " get drunk!");
			}

			return false;
		}

		if (~["#v8bot", "##javascript", "#regex", "#buubot", "#Node.js", "#facebook"].indexOf(channel)) {
			runCommand(c, msg, client, message, channel, nick, false);
		}
	}
});

api.addListener("userjoin", function(client, channel, nick) {
	// A user joined a channel
	//sys.puts(sys.inspect(arguments));
});

api.addListener("userpart", function(client, channel, nick, message) {
	// A user parted a channel
	//sys.puts(sys.inspect(arguments));
});

api.addListener("userquit", function(client, nick, message) {
	// A user parted a channel
	//sys.puts(sys.inspect(arguments));
});

api.addListener("kicked", function(client, channel, message, admin) {
	// Bot got kicked from channel
	//sys.puts(sys.inspect(arguments));
});

api.addListener("userkicked", function(client, channel, nick, message, admin) {
	// A user got kicked from channel
	//sys.puts(sys.inspect(arguments));
});
