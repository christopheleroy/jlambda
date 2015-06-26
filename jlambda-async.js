var async = require("async");
var request = require("request");
var _ = require("lodash");


// request.defaults({'proxy': 'http://cachestream.na.novartis.net:80/'});

var jlambda = require("./jlambda-core.js");

function thenDoThis(aCtx, thenFN, data) {
	if(thenFN) {
		var bCtx = jlambda.context(data);
		var cCtx = thenFN(bCtx);
		cCtx.done = function() {
			if(cCtx.failed) {
				aCtx.failed = true;
				aCtx.failures = aCtx.failures.concat(cCtx.failures);
			}
			aCtx.outp = cCtx.outp;
			aCtx.done();
		};
		if(!thenFN.isAsynchronous) {
			cCtx.done();
		}
	}else{
		aCtx.outp = data;
		aCtx.done();
	}
}

function thenFailThis(aCtx,data) {
	aCtx.failed = true;
	aCtx.outp   = data;
	aCtx.done();
}


jlambda.addPrefunctionator(
	function(obj, ctx) {
		return obj.async && _.isObject(obj.async) && (obj.async.get || obj.async.post);
	},

	function(obj, ctx) {

		//relevant perhaps for gets and posts - but nothing else...
		var statusCodeOK = obj.async.okCodes ? obj.async.okCodes :
					obj.async.okCode ? [ obj.async.okCode ] : [200];

	    var ajson = !!obj.async.json;


		if(obj.async.get || obj.async.post) {
			var http = obj.async.get || obj.async.post;
			// var isPost = !!obj.async.post;
			if(_.isString(http)) {
				var statusCodeOK = obj.async.okCodes ? obj.async.okCodes :
					obj.async.okCode ? [ obj.async.okCode ] : [200];

				var thenFN = _.isUndefined(obj.then) ? null : jlambda.functionator(obj.then, ctx);
				if(ctx.failed) return null;

				var FN = function(aCtx) {
					var opt = {};
					opt.url = http;


					request(opt, function(err, httpResponse, data) {
						if(err) {
							aCtx.failed = true;
							aCtx.error  = err;
							aCtx.done();
						}else{
							var statusCode = httpResponse.statusCode;
							if(_.contains(statusCodeOK, statusCode)) {
								data = ajson ? JSON.parse(data) : data;
								thenDoThis(aCtx, thenFN, data);
							}else{
								aCtx.statusCode = statusCode;
								thenFailThis(aCtx, data);
							}
						}
					});


				};
				FN.isAsynchronous = true;
				FN.isFunctionated = true;
				return FN;

			}else if(_.isObject(http)) {
				var httpFN = jlambda.functionator(
						(obj.map ? {map: http} : http), ctx);

				if(ctx.failed) return null;
				var isParallel = !!obj.map || obj.parallel;
				var thenFN = _.isUndefined(obj.then) ? null : jlambda.functionator(obj.then, ctx);
				if(ctx.failed) return null;				


				var FN = function(aCtx) {
					
					var bCtx = httpFN(aCtx);
					if(aCtx.failed) {
						thenFailThis(aCtx, null);
					}else{
						
						var overallOUTP = [];
						var items = isParallel ? 
							_.map(bCtx.outp, function(item, i) {
								return {i: i, it: item};
							}) :
							[ {i: 0, item: bCtx.outp } ];
						

						async.each(items, function(item,cb) {
							// item may be a single string, an array (we use the first one), or an object
							var opt = _.isObject(item.it) ? item.it : 
								_.isArray(item.it) && item.it.length>0 ? item.it[0] : {url: item.it};
							request(opt, function(err, response, data) {
								if(err) {
									aCtx.failed = true;
									aCtx.error_i = item.i;
									aCtx.error = err;
									cb(err);
								}else{

									if(ajson) {
										data = JSON.parse(data);
									}
									overallOUTP[ item.i ] = {outp: data, statusCode: response.statusCode, ok: _.contains(statusCodeOK, response.statusCode) };
									cb();
								}

							});
						}, function(err) {
							var data = isParallel ? 
								_.map(overallOUTP, function(z) {
									return z.ok ? z.outp : null;
								}) : overallOUTP[0];

							thenDoThis(aCtx, thenFN, data);
						});

					}
				};
				FN.isFunctionated = true;
				FN.isAsynchronous = true;
				return FN;
			}
		}

		ctx.failed = true;
		return null;
	});

