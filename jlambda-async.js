var async = require("async");
var request = require("request");
var _ = require("lodash");


// request.defaults({'proxy': 'http://cachestream.na.novartis.net:80/'});

var jlambda = require("./jlambda-core.js");


var _configuredAuth = [];
var _configuredProxy = [];
var _globReportTime = false;

function addAuth(hostPattern, username, password, cookie) {

	if(_.isString(hostPattern)) {
		hostPattern = new RegExp(hostPattern);
	}
	_configuredAuth.push({pat: hostPattern, user: username, password: password, cookie: cookie});
}

function addProxy(hostPattern, proxy) {
	_configuredProxy.push({pat: new RegExp(hostPattern), proxy:proxy});
}

exports.addAuth = addAuth;
exports.addProxy = addProxy;
exports.addReportingTime = function(bool) { 
	_globReportTime = !! bool;
}

function twoStepFinder(array1, array2, finder) {
	var found = null;
	if(array1) found = _.find(array1, finder);
	if(!found && array2) found = _.find(array2, finder);
	return found;
}

function injectConfiguration(opts, ctxConfig) {
	var url = opts.url ? opts.url.toString() : "no-url-is-not-supported-but-errors-will-come-later-i-guess";

	var finder = function(a) { return url.match(a.pat); }

	// if ctxConfig comes with auth spec, we will use this, otherwise we use the configured-auth
	var auth = twoStepFinder(  (ctxConfig && ctxConfig.authArray ? ctxConfig.authArray : null), _configuredAuth, finder);
	if(auth) {
		if(auth.cookie && ctxConfig.cookies && ctxConfig.cookies[ auth.cookie ]) {
			var ckName = auth.cookie;
			var ckValue = ctxConfig.cookies[ckName];
			var jar = request.jar();
			var ck  = request.cookie(ckName+"="+ckValue);
			jar.setCookie(ck, opts.url);
			opts.jar = jar;
			console.warn("added cookie " + ckName);				
		}else if(auth.user && !_.isUndefined(auth.password)){
			opts.auth = {username: auth.user, password: auth.password };	
			console.warn("found authentication for " +url);
		}else{
			console.warn("found authentication specs but missing cookie...?");
		}
		
	}
	var proxy = twoStepFinder( (ctxConfig && ctxConfig.proxyArray ? ctxConfig.proxyArray : null), _configuredProxy, finder);
	if(proxy) {
		opts.proxy = proxy.proxy;
		console.warn("found proxy for " + url);
	}
}



function thenDoThis(aCtx, thenFN, data, mode, adaptor) {
	if(adaptor) {
		var xCtx = jlambda.context(data);
		var yCtx = adaptor(xCtx);

		if(yCtx.failed) {
			aCtx.failed = true;;
			aCtx.failures = aCtx.failures.concat(yCtx.failures);
			aCtx.outp = yCtx.outp;
			aCtx.done();
			return;
		}else{
			data = yCtx.outp;
		}
	}

	if(thenFN) {
		data  = mode == 'mix' ? [aCtx.inp, data ] : data;
		var bCtx = jlambda.context(data, undefined, function() {
			if(this.failed) {
				aCtx.failed = true;
				aCtx.failures = aCtx.failures.concat(this.failures);
			}
			aCtx.outp = this.outp;
			aCtx.done();
		});
		if(aCtx.cookies) bCtx.cookies = aCtx.cookies;
		cCtx = thenFN(bCtx);
		if(!thenFN.isAsynchronous) {
			cCtx.done();
		}
	}else{
		aCtx.outp = data;
		aCtx.done();
	}
}
exports._thenDoThis = thenDoThis;

function thenFailThis(aCtx,data) {
	aCtx.failed = true;
	aCtx.outp   = data;
	aCtx.done();
}

function reportingTime(start,end,url,err,httpResponse) {
	if(_.isNull(end)) {
		end = (new Date()).getTime();
	}
	console.info({url: url, start: start, duration: (end-start), 
					error: (!_.isNull(err)),
		statusCode: (_.isNull(err) && httpResponse ? null: httpResponse.statusCode)})
}



jlambda.addPrefunctionator(
	function(obj, ctx) {
		return obj.async && _.isObject(obj.async) && (obj.async.get || obj.async.post);
	},

	function(obj, ctx) {

		//relevant perhaps for gets and posts - but nothing else...
		var statusCodeOK = obj.async.okCodes ? obj.async.okCodes :
					obj.async.okCode ? [ obj.async.okCode ] : [200,304];

	    var ajson = _.isUndefined(obj.async.json) ? true : (!!obj.async.json);
		
		var mode = obj.async.mode || 'straight';

		var adaptor = obj.adapt ? jlambda.functionator(obj.adapt,ctx) : null;
		var wrap    = obj.wrap;
		
		var reportTiming = (!!obj.async.timing)||_globReportTime;


		if(ctx.failed) return null;
		if(adaptor && adaptor.isAsynchronous) {
			ctx.failures.push("async adaptor (adapt) cannot be asynchronous, use 'then' ");
			ctx.failed = true;
			return null;
		}



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
					if(_.isUndefined(aCtx.done)) {
						debugger;
					}
					
					injectConfiguration(opt, aCtx);
					var start = reportTiming ? (new Date()).getTime(): 0;
					request(opt, function(err, httpResponse, data) {
						if(start) reportingTime(start,null, opt.url, err,httpResponse);

						if(err) {
							aCtx.failed = true;
							aCtx.error  = err;
							aCtx.done();
						}else{
							var statusCode = httpResponse.statusCode;
							
							if(_.contains(statusCodeOK, statusCode)) {
								data = ajson ? JSON.parse(data) : data;
								if(wrap && ! _.isArray(data)) data = [ data ];
								thenDoThis(aCtx, thenFN, data, mode,adaptor);
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

				var mixer = obj.mix == 'in-out' ? 'io' : 
							obj.mix == 'pair' ? 'pair' : 'none';

				var picker = _.isString(obj.pick) ? ['s', obj.pick] : 
					_.isNumber(obj.pick) ? ['n',  obj.pick ] : null;

				if(ctx.failed) return null;
				var isParallel = !!obj.map || obj.parallel || _.isNumber(obj.limit);
				var limit = isParallel ? (_.isNumber(obj.limit) ? obj.limit : 1) : 7;
				var thenFN = _.isUndefined(obj.then) ? null : jlambda.functionator(obj.then, ctx);
				if(ctx.failed) return null;				


				var FN = function(aCtx) {

					if(_.isUndefined(aCtx.done)) {
						debugger;
					}
					var bCtx = httpFN(aCtx);
					if(bCtx.failed) {
						thenFailThis(aCtx, null);
					}else{
						
						var overallOUTP = [];
						var items =
							_.map(bCtx.outp, function(item, i) {
								return {i: i, it: item};
							}) ;

						var issues = [];
						_.each(items, function(item, i) {
							if(picker && picker[0] == 'n') {
								if(_.isArray(item.it)) {
									item.picked = item.it[picker[1]];
								}else{
									issues.push("item " + (i+1) + " is not an array");
								}
							}else if(picker && picker[0] == 's') {
								if(_.isObject(item.it)) {
									item.picked= item.it[ picker[1] ];
								}else{
									issues.push("item " + (i+1) + " is not an object/map");
								}
							}else{
								item.picked = item.it;
							}
						});
						if(issues.length>0) {
							aCtx.failures = aCtx.failures.concat(_.map(issues, function(i) {
								return "Issue with 'pick': " + i;
							}));
							aCtx.failed=true;
							return thenFailThis(aCtx, items);
						}
						
						async.eachLimit(items, limit, function(item,cb) {
							// item may be a single string, an array (we use the first one), or an object
							var it = item.picked;

							var opt = _.isObject(it) ? _.clone(it) : 
								_.isArray(it) && it.length>0 ? _.clone(it[0]) : {url: it};
							
							injectConfiguration(opt, aCtx);
							var start = reportTiming ? (new Date()).getTime() : 0;
							request(opt, function(err, response, data) {
								if(start) reportingTime(start,null, opt.url, err,response);
								if(err) { 
									aCtx.failed = true;
									aCtx.error_i = item.i;
									aCtx.error = err;
									cb(err);
								}else{
									if(ajson) {
										try { 
											data = JSON.parse(data);
										}catch(e) { 
											overallOUTP[item.i]={"straight-outp":data, outp:[], statusCode: response.statusCode, ok: false};
											return cb();
										}
									}
									if(wrap && ! _.isArray(data)) data = [ data ];
									if(mixer == 'io') {
										data = {in: item.it, out: data };
									}else if(mixer == 'pair') {
										data = [ item.it, data ];
									}

									overallOUTP[ item.i ] = {outp: data, statusCode: response.statusCode, ok: _.contains(statusCodeOK, response.statusCode) };
									cb();
								}

							});
						}, function(err) {
							var data = 
								_.map(overallOUTP, function(z) {
									return z && z.ok ? z.outp : null;
								});

							thenDoThis(aCtx, thenFN, data, mode, adaptor);
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

