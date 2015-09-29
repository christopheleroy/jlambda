var jLambda   = require("./jlambda-core.js");
var ajl       = require("./jlambda-async.js");
var express   = require("express");
var parseArgs = require("minimist");
var _         = require("lodash");
var cookieParser = require("cookie-parser");
var uti = require("./uti-convert.js");


var jlsrv = express();
jlsrv.use(cookieParser());

var argv = parseArgs(process.argv);


configureAsyncJlambda(argv);
configureGlobalDefinitions(argv);


jlsrv.get("/jlambda", function(req,res) {
	var q = req.query;
	var cookies = _.clone(req.cookies);

	var payloadJson = q.payload || q.p;
	var lambdaJson  = q.lambda || q.l;
	var inJson      = q.jp;
	var wrap        = q.wrap || q.w;
	var format      = q.format || q.f || 'json';

	var payload = null, lambda = null;
	if(format == 'json') 
		res.set('Content-type', 'application/json');

	if(payloadJson && lambdaJson) {
		try {
			if(wrap) {
				if(wrap == ',' || wrap == '|') {
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
				res.status(500).send('{"error":"Input JSON could not be parsed: ' +
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
			res.status(500).send('{"error":"Input json parsed but missed lambda or payload: '+
				(_.isNull(payload) ? '(payload missing)': '') +
					(_.isNull(lambda)  ? '(lambda missing)': '') + '"}');
			return;
		}
	}
	if(_.isNull(lambda) || _.isNull(payload)) {
		res.status(500).send('{"error":"No parameters were detected", "help": ["Use lambda or l for the lambda expression.", "Use payload or p for the payload expression.", "Use jp for both."]}');
		return;
	}
	var ctx = jLambda.context();
	var FN = jLambda.functionator(lambda, ctx);
	if(ctx.failed) {
		res.status(500).send(JSON.stringify({error: "error in functionator", "context": ctx }));
		return;
	}

	var afterwards = function() {
		if(this.failed) {
			res.status(500).send(JSON.stringify({"error": "error during evaluation", "failures": this.failures}));
		}else{
			if(format == 'csv' || format=='CSV') {
				var columns = uti.listColumns(this.outp);
				var reportDef = uti.makeReportsDef(columns);
				var csv = uti.convertJSONToCSV(this.outp, reportDef, ",");
				res.set('Content-type', 'application/vnd.ms-excel');
				res.status(200).send(csv);
			}else{
				res.status(200).send(JSON.stringify(this.outp));
			}
		}
	};
	console.info(JSON.stringify(lambda,null,1));
	console.info(payload);

	var execCtx = null;
	if(FN.isAsynchronous) {
		execCtx = jLambda.context(payload, null, afterwards);
		execCtx.cookies = cookies;
		FN(execCtx);	
	}else{
		execCtx = jLambda.context(payload)
		execCtx.cookies = cookies; 
		var out = FN(execCtx);
		(afterwards.bind(out))();
	}
});

var port = argv.port ? parseInt(argv.port) : 11111;
var server = jlsrv.listen(port, function() {
	console.info("Jlambda server running on port " + server.address().port + " of " + server.address().address);
});


function configureAsyncJlambda(argv) {
	 if(argv.proxy) {
		if(argv.internal) {
			var pat = "^https?://[^/]*"+argv.internal;
			ajl.addProxy(pat, null);
		}
		ajl.addProxy("^http", argv.proxy)
	}
	if(argv.cookie) {
		if(argv.internal) {
			var pat = "^https?://[^/]*"+argv.internal;
			ajl.addAuth(pat, null, null, argv.cookie);
		}else{
			ajl.addAuth(".*", null,null, argv.cookie);
		}
	}
}

function configureGlobalDefinitions(argv) {
	if(argv.defs) {
		var djl = require("./jlambda-define.js");
		djl.loadGlobalDefinitions(argv.defs, "*");		
	}
}



