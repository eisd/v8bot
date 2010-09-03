// sandbox.js - Rudimentary JS sandbox
// Gianni Chiappetta - gf3.ca - 2010

/*------------------------- INIT -------------------------*/
var sys = require("sys")
  , spawn = require('child_process').spawn
  ;

if (typeof Object.prototype.extend !== 'function') {
	Object.defineProperty(Object.prototype, "extend", {
		"value":function (obj) {
			var key, keys, i, length;
			for (i = 0, keys = Object.keys(obj), length = keys.length; i < length; i++) key = keys[i], this[key] = obj[key];
			return this;
		}
	});
}

/*------------------------- Sandbox -------------------------*/
function Sandbox(options) {
	this.options = {}.extend(Sandbox.options).extend(options || {});

	this.run = function(code, callback) {
		// Any vars available?
		var timer,
			stdout = "",
			output = function(data) {
				if (!!data) stdout += data;
			},
			child = spawn(this.options.node, [this.options.shovel]);
    
		// Listen
		child.stdout.addListener("data", output);
		child.addListener("exit", function(code) {
			clearTimeout(timer);
			callback.call(this, stdout);
		});
    
		// Go
		child.stdin.write(code);
		child.stdin.end();
		timer = setTimeout(function() {
			child.stdout.removeListener("output", output);
			stdout = "Error: Timeout";
			child.kill();
		}, this.options.timeout);
	};
}

// Options
Sandbox.options = {
	timeout: 5000,
	node: "node",
	shovel: (function() {
			var p = __filename.split("/").slice(0, -1);
			p.push("shovel.js");
			return p.join("/");
		})()
};

/*------------------------- Export -------------------------*/
module.exports = Sandbox;

