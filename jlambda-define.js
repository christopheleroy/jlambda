var _ = require("lodash");
var jlambda = require("./jlambda-core.js");


var __global_definitions__ = {};


jlambda.addPrefunctionator(
	function(obj, ctx) {
		return (obj.define && _.isObject(obj.define)) || _.isString(obj.exec);
	},

	function(obj, ctx) {
		if(ctx.failed) return null;
		if(!ctx._defs_) {
			ctx._defs_ = {};
		}
		if(obj.exec) {
			if(obj.exec.match(/^\//)) {
				
				var lFN = ctx._defs_[ obj.exec ];
				if(!lFN) { 
					ctx.failed = true;
					ctx.failures.push("exec: " + obj.exec + " is not previously defined.");
					return null;
				}
				var withFN = _.isUndefined(obj.with) ? function(x) { return x; } : jlambda.makePicker(obj.with, ctx);
				if(ctx.failed){
					ctx.failures.push("exec: with is poorly defined.");
					return null;
				}
				var FN = function(aCtx) {
					aCtx = withFN(aCtx);
					if(aCtx.failed) return aCtx;
					
					return lFN(aCtx);
				};
				FN.isFunctionated = true;
				FN.isAsynchronous = !! lFN.isAsynchronous;
				
				return FN;
				
			}else{
				var qname =obj.exec;
				var withFN = _.isUndefined(obj.with) ? function(x) { return x; } : jlambda.makePicker(obj.with, ctx);
				if(ctx.failed) {
					ctx.failures.push("exec: with is poorly defined ...");
					return null;
				}
				
				var isAsync = (qname.match("@"));
                var thenFN = null;
                
                if(obj.then) {
                    thenFN = jlambda.functionator(ctx, obj.then);
                    if(thenFN && !isAsync) {
                        ctx.failed = true;
                        ctx.failures.push("exec/then: could not compile then-expression");
                    }
                    if(ctx.failed) return null;
                }
				
				var FN = function(aCtx) {
					var lFN = __global_definitions__[ qname ];
					if(lFN) {
						aCtx = withFN(aCtx);
						if(aCtx.failed) return aCtx;
                        // pass the "done" to the next thing if there is such a next thing
                        // if(isAsync && thenFN) {
                        //     var doneFNlast = aCtx.done;
                        //     var doneFNfirst = function() {
                        //         var bCtx = jlambda.context(this.out, null, doneFNlast);
                        //         bCtx.cookies = this.cookies;
                        //         return thenFN(bCtx);
                        //     };
                        //     doneFNfirst.bind(aCtx);
                        //     return lFN(aCtx);
                        // }else if(thenFN && !isAsync) {
                        //     var cCtx = lFN(aCtx);
                        //     if(cCtx.failed) {
                        //         return cCtx;
                        //     }else{
                        //         var bCtx = jlambda.context(cCtx.outp, aCtx.done);
                        //         bCtx.cookies = aCtx.cookies;
                                
                                
                        //     }
                        // }
						return lFN(aCtx);
					}else{
						aCtx.failed = true;
						aCtx.failures.push("Global definition " + qname +": not found");
					}
					return aCtx;
				};
				
				FN.isFunctionated = true;
				FN.isAsynchronous = isAsync;
				return FN;
			}
		}else{
			
			var definitions = obj.define;
			var newGlobalDefs = {};
			_.each(definitions, function(def, qname) {
				var subCtx = jlambda.context();
				subCtx._defs_ = ctx._defs_;
				var FN = jlambda.functionator(def, subCtx);
				if(subCtx.failed) {
					ctx.failed = true;
					ctx.failures.push("[errors defining "  + qname + "]");
					ctx.failures = ctx.failures.concat( _.map(subCtx.failures, function(msg) { return "[defining "+qname+"]" + msg;}));
				}else{
					// enforce convention: if name contains @ character, it must be an asynchronous function
					if(qname.match(/@/)) {
						if(!FN.isAsynchronous) {
							ctx.failed = true;
							ctx.failures.push("error defining " + qname + ": it must be an asynchronous function");
						}
					}else{
						if(FN.isAsynchronous) {
							ctx.failed = true;
							ctx.failures.push("error defining " + qname + ": it may not be an asynchronous function (or must contain @ character in its name)");
						}
					}
					if(ctx.failed) return true;
					if(qname.match(/^\//)) {
						ctx._defs_[qname]=FN;
					}else{
						if(ctx.globalDefsAllowed) {
							if(_.isObject(ctx.globalDefsAllowed)) {
								var m = qname.match(/^([^\/]+)\/(.+)/);
								if(m) {
									var app = m[1];
									var lqname = m[2];
									if(ctx.globalDefsAllowed[app]) {
										newGlobalDefs[qname] = FN;
									}else{
										ctx.failed = true;
										ctx.failures.push("error defining " +qname+ " - not authorized to define in application " + app);
									}
								}else{
									ctx.failed = true;
									ctx.failures.push("error defining " +qname+": malformed definition name - use /name (transient definition) or app/name (for app 'app') - if you are authorized for app...");
								}
							}else{
								newGlobalDefs[qname] = FN;
							}
						}else{
							ctx.failures.push("error defining " + qname + ": not authorized to define such a definition name");
							ctx.failed = true;
						}
					}
				}
			});
			if(ctx.failed) { 
				return null;
			}
			// add to global defs now that everything is ok
			_.each(newGlobalDefs, function(fn,qname) { __global_definitions__[qname] = fn; });
			var andThen = obj.then || {f:"id"};
			var zFN = jlambda.functionator(andThen, ctx);
			if(ctx.failed) {
				return null;
			}
			return zFN;
			
		}
	});
	
	
	
	
function loadGlobalDefinitions(src, allApps, appMap, fs, depthMax) {
	
	
	var srcType = fs.statSync(src);
	if(srcType.isDirectory()) {
		var files = fs.readdirSync(src);
		_.each(files, function(f) {
			var fType = fs.statSync(src + "/"+f);
			
			if(fType.isFile() && f.match(/\.json$/i)) {
				loadGlobalDefinitions(src + "/" + f, allApps, appMap, fs, depthMax);
			}else{
				if(fType.isDirectory() && depthMax>0) {
					loadGlobalDefinitions(src+ "/" + f, allApps, appMap,fs, depthMax-1);
				}
			}
		});
	}else{
		
		try {
			var content = fs.readFileSync(src, {encoding:'utf-8'});
			var json = JSON.parse(content);
			if(!_.isObject(json.define)) {
				console.info("for JSON " + src + ": no 'define' object found. Skipped");
				return ;
			}
			var ctx = jlambda.context();
			ctx.globalDefsAllowed = allApps || appMap;
			var defFN = jlambda.functionator(json,ctx);
			if(defFN && ! ctx.failed) {
				console.info("loaded definitions from " + src);
			}else{
				console.error("Failures when preparing definitions from " + src);
				console.error("------------------------------------------------------------------");
				_.each(ctx.failures, function(msg) { console.error(msg)});
				console.error("------------------------------------------------------------------");
			}
		}catch(e) {
			console.log("exceptions when loading definitions from "+src);
			console.log(e);
		}
	}
	
}

exports.loadGlobalDefinitions = function(src, apps) {
	var fs = require("fs");
	
	if(apps == "*") {
		loadGlobalDefinitions(src, true, {}, fs, 3);
	}else{
		var appMap = _.reduce(apps, function(m, app) { m[app] = true; return m;},{});
		loadGlobalDefinitions(src, false, appMap, fs, 4);
	}
}