
var requirejs = require("requirejs");

// using __dirname everywhere we use a local module, as requirejs is a little harder to configure than I expected
var jlambda = requirejs(__dirname + "/jlambda-core.js");
var fs = require('fs');
var parseArgs = require("minimist");
var _ = require("lodash");



var dataIn = "";
var argv = parseArgs(process.argv);


function processIt(data, doTest, pretty){
	// console.log(dataIn);
	// var data = JSON.parse(dataIn);
	// console.log(JSON.stringify(data.lambda));
	if(data.async) { // make sure the module is loaded if it is stated as require in the test case
		var ajl = requirejs(__dirname+"/jlambda-async.js");
	}
	if(data.define) {// make sure the module is loaded if it is stated as require in the test case
		var djl = requirejs(__dirname+"/jlambda-define.js");
	}
	if(data.lambda && data.payload) {
		var ctx = jlambda.context();
		var lambda = jlambda.functionator(data.lambda, ctx);
		if(ctx.failed || !lambda) {
			console.error(ctx.failures);
			process.exit(11);
		}else{

			var afterwards = function() {
				    var output = "";
					if(this.failed) {
						console.error(this.failures);
						process.exit(7);
					}else if(pretty == 'csv') {
						var uti = require("./uti-convert.js");
						var json = this.outp;
						var cols = uti.listColumns(json);
						var redf = uti.makeReportsDef(cols);
						var csv  = uti.convertJSONToCSV(json, redf,",");
						output = csv;
					}else{
						output = pretty? JSON.stringify(this.outp, null, 2) : JSON.stringify(this.outp);
					}
					try { process.stdout.write(output); }
					catch(e) {
						console.error("Exception when outputing the results in jlsh.js ... ");
						console.error(e);
						console.log(this.outp);
						console.error("Exception:" +e.toString());
						process.exit(7);
					}
					process.exit(0);

				};

			if(doTest) {
				if(!_.isUndefined(data.expect)) {
					var dataExpected = data.expect;
					afterwards = function() {
						if(this.failed) {
							console.error(this.failures);
							process.exit(77);
						}else{
							var crudeTest = (JSON.stringify(dataExpected) == JSON.stringify(this.outp));
							if(crudeTest) {
								console.warn("ok!");
								process.exit(0);
							}else{
								console.warn("failed!");
								process.exit(1);
							}
						}
					};
				}else if(data.expectFailure || data.expectSuccess) {
					var dataFailureExpected = !!data.expectFailure;
					var dataSuccessExpected = !!data.expectSuccess;
					afterwards = function() {
						if((this.failed && dataFailureExpected) || (dataSuccessExpected && !this.failed)) {
							console.warn("ok")
						}else{
							console.warn("failed!");
						}
					};
				}
			}

			if(lambda.isAsynchronous) {
				var data = jlambda.context(data.payload, null, afterwards);
				var dataout = lambda(data);

			}else{
				var data = jlambda.context(data.payload);
				var dataout = lambda(data);
				(afterwards.bind(dataout))();
			}

		}
	}
}

function readStdin( next ) {
	var dataIn = "";
	process.stdin.on('readable', function() {
		var chunk = process.stdin.read();
		if(chunk !=null) {
			dataIn += chunk
		}
	});
	process.stdin.on('end', function() {
		next(dataIn);
	});
}

function readFile(file, next, fail) {
	fail = fail || failureOnRead;
	fs.readFile(file, {encoding: 'utf-8'}, function(err, data) {
		if(err) { fail(err); }
		else next(data);
	});
}

function readyProcessing(lambdaData, jsonData, doTest, pretty) {
	var lambdaJson = JSON.parse(lambdaData);
	var dataJson   = JSON.parse(jsonData);
	var data = {lambda: lambdaJson, payload: dataJson};
	processIt(data, doTest,pretty);
}

function failureOnRead(err) {
	console.error(err);
	console.error("Failured on reading input file...");
}

var doTest = !! argv.t;

if(argv.h || argv.help) {
	console.warn("jlhs.js : run jLambda program or test\n\nOption-1: jlsh.js --json (input-data-json-file)  --lambda (jlambda-expression-json-file)\nOption-2: jlsh.sh --in (mixed-input-data-and-jlambda-expression-json-file)\nOption-3: jlsh-sh (no input file)\n\nAdditional possible options: --proxy, --netrc,-t\n\n");
	console.warn("Option 1: the jlambda program is found in a json file and the input data is found in the other json file\nOption 2: a single json file hold both the jlambda program and the input data. Example below.\nOption 2 and 3 are the same, except that the mixed json file is read from the STDIN\n");
	console.warn("For Option 2 or 3, the input data is in the 'payload' item and the jlambda expression is found in the 'lambda' item\nExample: {payload:[0,1,2,3], lambda: {f:'max'} }\n");
	console.warn("\n\nUse option -t for a test, it will compare the output with the item 'expect' of the --in file");
	console.warn("        example: {payload:[0,1,2,3], lambda: {f:'max'}, expect: 3}")
	console.warn("Use option --proxy to specify an http proxy for your asynchronous calls");
	console.warn("Use option --netrc to pass username/password for different patterns of webservice servers (see netrc-example.json)");
	process.exit(1);
}


// Process command line parameter for PROXY
if(argv.proxy) {
	var jlasync = requirejs(__dirname +"/jlambda-async.js");
	jlasync.addProxy(".",  argv.proxy);
}

// Process command line parameter for NETRC
if(argv.netrc) {
	var jlasync = require(__dirname+"/jlambda-async.js");
	var netrcJson = fs.readFileSync(argv.netrc);
	var netrc = [];
	try {
		netrc = JSON.parse(netrcJson);
	}catch(e) {
		console.error("Exception when parsing JSON from " + argv.netrc);
		console.error(e);
		process.exit(999);
	}
	if(netrc.length==0) {
		console.warn("Netrc seems empty...");
	}else{
		_.each(netrc, function(x) {
			if(x.pattern && x.machine) {
				jlasync.addAuth( new RegExp(x.machine), x.username, x.password );
			}
		});
	}

}

if(argv.defs) {
	var jldef = requirejs(__dirname+"/jlambda-define.js");
	jldef.loadGlobalDefinitions(argv.defs, "*");
}

var pretty = !! argv.pretty;
if(argv.csv) pretty = 'csv';

// Process the JLAMBDA and JSON options
if(argv.lambda && argv.json) {
	if(argv.lambda == '-' && fs.existsSync(argv.json)) {
		readStdin(function(lambdaData) {
			readFile(argv.json, function(jsonData) {
				readyProcessing(lambdaData, jsonData, doTest,pretty);
			});
		});
	}else if(argv.json == '-' && fs.existsSync(argv.lambda)) {
		readStdin(function(jsonData) {
			readFile(argv.lambda, function(lambdaData) {
				readyProcessing(lambdaData, jsonData, doTest,pretty);
			});
		});
	}else{
		if(! (fs.statSync(argv.lambda).isFile() && fs.statSync(argv.json).isFile())) {
			console.error("File " + argv.lambda + " or " + argv.json + "  not found");
		}else{
			readFile(argv.lambda, function(lambdaData) {
				readFile(argv.json, function(jsonData) {
					readyProcessing(lambdaData, jsonData, doTest,pretty);
				});
			});
		}
	}
}else if(argv.in) {
	readFile(argv.in, function(whole) {
		var wholeJson = JSON.parse(whole);
		processIt(wholeJson, doTest, pretty);
	});
}else{
	readStdin(function(whole) {
		var wholeJson = JSON.parse(whole);
		processIt(wholeJson, doTest,pretty);
	});
}
