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

function parsePayload(payloadJson, wrap) {
	var payload = [];
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
	return payload;
}

var COOKIE_JAR_INDEX = {};

if(argv.cookie) {

    var cookieTag = argv.cookie;
    jlsrv.get("/add-tmp-cookie", function(req, res) {
        var q = req.query;
        var key = q.z;
        var expiration = q.seconds || 5;
        var expirationTS = (new Date()).getTime() + expiration*1000;
        var done = {};
        if(key && key.length>16) {
            var cookies = _.clone(req.cookies);
            if(cookies[cookieTag]) {
                var qk = {}; qk[cookieTag] = cookies[cookieTag];
                COOKIE_JAR_INDEX[ key ] = { expiration: expirationTS, cookies: qk};
                done.success=true;
                done.expiration = expirationTS;
                done.expirationISO = (new Date(expirationTS)).toISOString();
            }else{
                delete COOKIE_JAR_INDEX[key];
                done.success = true;
                done.removed = true;
            }
        }else{
            done.success = false;
            done.message = "Key is too short";
        }
        res.set('Content-type', 'application/json');
        res.status(200).send(JSON.stringify(done, null, 1));  
    });
}

jlsrv.get("/jlambda", function(req,res) {
	var q = req.query;
	var cookies = _.clone(req.cookies);

	var payloadJson = q.payload || q.p;
	var lambdaJson  = q.lambda || q.l || "";
	var inJson      = q.jp;
	var exec        = q.exec || q.x;
	var wrap        = q.wrap || q.w;
	var format      = q.format || q.f || 'json';
    	var zParam      = q.z;
	var noDecode    = q.nd;

	if(!noDecode) {
		lambdaJson = lambdaJson.replace(/%3A/g,":").replace(/%2F/g, "/").replace(/%22/g,'"');
	}
    
    
    if(zParam) {
        var ckj = COOKIE_JAR_INDEX[zParam];
        var now = (new Date()).getTime();
        if(ckj) {
            if(ckj.expiration > now) {
                cookies = _.clone(ckj.cookies);
            }
        }
        
        var expired = _.reduce(COOKIE_JAR_INDEX, function(list, ckj, key) {
            if(ckj.expiration < now) {
                list.push(key);
            }
            return list;
        });
        if(expired && expired.length>0) {
            console.log("Deleting coo-keys: " + expired.join(", "));
            _.each(expired, function(key) { delete COOKIE_JAR_INDEX[key];});
        }
    }

	var payload = null, lambda = null;
	if(format == 'json') {
		res.set('Content-type', 'application/json');
	}

	if(payloadJson && lambdaJson) {
		payload = parsePayload(payloadJson, wrap);
		try {
			lambda = JSON.parse(lambdaJson);
		}catch(e) {
			console.log("Unable to parse lambdaJson");
			console.log(lambdaJson);
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
	}else if(exec) {
		lambda = {exec: exec};
		if(payloadJson) {
			payload = parsePayload(payloadJson, wrap);
			if(_.isNull(payload)) {
				res.status(500).send('{"error":"Payload json could not be parsed"}');
				return;
			}
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
			}else if(format == 'html' || format == 'HTML') {
				var columns = uti.listColumns(this.outp);
				var reportDef = uti.makeReportsDef(columns);
				var html = uti.convertJSONToHTML(this.outp, reportDef);
				res.set('Content-type', 'text/html');
				res.status(200).send("<html><head></head><body>"+html+"</body></html>");
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



