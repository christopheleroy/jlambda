var jLambda = require("./jlambda-core.js");
var ajl     = require("./jlambda-async.js");
var express = require("express");
var parseArgs = require("minimist");
var _         = require("lodash");


var jlsrv = express();

var argv = parseArgs(process.argv);


jlsrv.get("/jlambda", function(req,res) {
	var q = req.query;

	var payloadJson = q.payload || q.p;
	var lambdaJson  = q.lambda || q.l;
	var inJson      = q.jp;
	var wrap        = q.wrap || q.w;

	var payload = null, lambda = null;
debugger;
	if(payloadJson && lambdaJson) {
		try {
			if(wrap) {
				if(wrap == ',' || warp == '|') {
					payload = payloadJson.split(wrap);
				}else{
					payload = [ payloadJson ];
				}
			}else{
					payload = JSON.parse(payloadJson);
			}
		}catch(e) {
			payload = null;
		}
		try {
			lambda = JSON.parse(lambdaJson);
		}catch(e) {
			lambda = null;
		}
		if(_.isNull(payload)  || _.isNull(lambda) ) {
				res.send(500, '{"error":"Input JSON could not be parsed: ' +
					(_.isNull(payload) ? '(payload json not parsed)': '') +
					(_.isNull(lambda)  ? '(lambda json not parsed)': '') + '"}');
				return;
		}
	}else if(inJson) {
		var issue = null;
		try {
			var inObj = JSON.parse(inJson);
			lambda = inObj.lambda || inObj.l;
			payload = _.isUndefined(inObj.payload) ? inObj.payload :
			           _.isUndefined(inObj.p) ? inObj.p : null;
		}catch(e) {
			issue = "Unable to parse the json passed in jp";
		}
		if(!issue && (_.isNull(lambda) || _.isNull(payload))) {
			res.send(500,'{"error":"Input json parsed but missed lambda or payload: '+
				(_.isNull(payload) ? '(payload missing)': '') +
					(_.isNull(lambda)  ? '(lambda missing)': '') + '"}');
			return;
		}
	}
	if(_.isNull(lambda) || _.isNull(payload)) {
		res.send(500, '{"error":"No parameters were detected", "help": ["Use lambda or l for the lambda expression.", "Use payload or p for the payload expression.", "Use jp for both."]}');
		return;
	}
	var ctx = jLambda.context();
	var FN = jLambda.functionator(lambda, ctx);
	if(ctx.failed) {
		res.send(500, JSON.stringify({error: "error in functionator", "context": ctx }));
		return;
	}

	var afterwards = function() {
		if(this.failed) {
			res.send(500, JSON.stringify({"error": "error during evaluation", "failures": this.failures}));
		}else{
			res.send(200, JSON.stringify(this.outp));
		}
	};


	
	if(FN.isAsynchronous) {
		var execCtx = jLambda.context(payload, null, afterwards);
		FN(execCtx);	
	}else{
		var out = FN(jLambda.context(payload));
		(afterwards.bind(out))();
	}
});

var port = argv.port ? parseInt(argv.port) : 11111;
var server = jlsrv.listen(port, function() {
	console.info("Jlambda server running on port " + server.address().port + " of " + server.address().address);
});