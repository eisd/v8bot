// shovel.js - Do the heavy lifting in this sandbox
// Gianni Chiappetta - gf3.ca - 2010

/* ------------------------------ INIT ------------------------------ */
var sys = require('sys')
  , code = ''
  , reserved =
      { 'require': null
      , '__filename': null
      , '__module': null
      , 'module': null
      , 'code': null
      , 'reserved': null
      , 'run': null
      , 'sys': null
      }
    ;
var Script = process.binding('evals').Script;

/* ------------------------------ Sandbox ------------------------------ */
// Generate list of reserved items
for (var i in GLOBAL) reserved[i] = null;

// Get code
var stdin = process.openStdin();
stdin.on('data', function(data) {
	code += data;
});
stdin.on('end', run);

// Run code
function run() {
	var error = false, output = (function() {
		try {
			//Removed eval code because v8 runs faster without it -- good for benchmarks
			//runInNewContext also executes in sandboxed environment so global variable sandboxing, with statements, etc. shouldn't matter
			//with (reserved) { return eval(this.toString()) };

			return Script.runInNewContext(this.toString().replace(/\\([rn])/g, "\\\\$1"));
		}
		catch (e) {
			error = true;
			return e.name + ': ' + e.message;
		}
	}).call(code);
  
	process.stdout.on('drain', function() {
		process.exit(0);
	});

	//Format output
	function serialize(o) { //Clone serialize function since this is separate process
		//if (o.toSource) return o.toSource();
		switch (typeof o) {
			case 'number':
			case 'boolean':
			case 'function':
				return o.toString();
			case 'string':
				return "\"" + o.toString() + "\"";
			case 'undefined':
				return undefined;
			case 'object':
				var s = "";
				if (Array.isArray(o)) {
					if (!o.length) s = "[]";
					else {
						s = '[';
						for (var i=0,l=o.length-1;i<l;i++) s += serialize(o[i]) + ', ';
						s += serialize(o[i]) + ']';
					}
				}else {
					if (o === null) s = "null";
					//constructor.toString() due to different context so instanceof fails
					else if (o.constructor && ~o.constructor.toString().toLowerCase().indexOf("date")) s = "\"" + o.toString() + "\"";
					else {
						s = '{';
						for (var key in o) s += "\"" + key + "\": " + serialize(o[key]) + ', ';
						s = s.replace(/,\s*$/, '') + '}';
					}
				}
				return s;
			default:
				return null;
		}
	}

	if (typeof output === "undefined") output = "undefined";
	else if (output === null) output = "null";
	else if (!error) {
		/*var sendCtor = output.constructor.toString().toLowerCase(); //instanceof/constructor don't work due to different context

		if (~sendCtor.indexOf("string") && !error) output = "\"" + output + "\"";
		else if (~sendCtor.indexOf("array")) output = "[" + output.join(", ") + "]";*/
		output = serialize(output);
	}

	process.stdout.write(output);
}