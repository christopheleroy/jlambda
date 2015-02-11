var _ = require('lodash');


function assert(ctx, msg, test,op) {

	if(test=='isMap') {
		test = _.isObject(op);
	}else if(test == 'isArray') {
		test = _.isArray(op);
	}

	if(_.isFunction(test)) {
		test= test(op);
	}
	if(!test) {
		if(_.isFunction(msg)) {
			msg = msg(op);
		}
		ctx.failures.push(msg);
		ctx.failed = true;
	}
}
var context = function(data) {
	if(_.isUndefined(data)) {
		data = [];
	}
	return { inp: data, clone: true, outp: [], failures: [], failed: false};
};
exports.context = context;


 exports.plucker = function(plKey, ctx, instruction) {
	ctx.outp = _.pluck(ctx.inp, plKey);
	return ctx;
};

var makePlucker = function (obj, ctx) {
	var plKey = obj.pluck;
	 var FN = function(aCtx) {
		aCtx.outp = _.pluck(aCtx.inp, plKey);
		return aCtx;
	};
	FN.isFunctionated = true;
	return FN;
};

var makeChain = function(obj, ctx) {
	if(_.isArray(obj.chain)) {
		var funcs = _.map(obj.chain, function(f) { return functionator(f, ctx); });
		if(ctx.failed) {
			ctx.failures.push("chain must get only functionables");
			return null;
		}
		var FN = function(aCtx) {
			var funcsLength = funcs.length;
			var cctx = context(aCtx.inp);
			for(var i=0; i<funcsLength && !cctx.failed;i++, cctx = context(cctx.outp)) {
				cctx = funcs[i](cctx);
				if(cctx.failed) {
					aCtx.failures = aCtx.failures.concat(_.map(cctx.failures, function(ff,ii) { return "[chain step "+ ii +"] " + ff; }));
					aCtx.failed = true;
					return aCtx;
				}
				aCtx.outp = cctx.outp;
			}
			
			return aCtx;
		};
		FN.isFunctionated = true;
		return FN;
	}else{
		ctx.failed = true;
		ctx.failures.push("chain expects an array of functionables");
	}
	return null;
}


exports.renamer = function(nameMap, ctx, instruction) {
	var keys = _.keys(nameMap);
	ctx.outp = _.map(ctx.inp, function(iZ) {
			var Z = (ctx.clone ? _.clone(iZ) : iZ);
			_.each(keys, function(k) {
				Z[ nameMap[k] ] = Z[k];
				delete Z[k];
			});
			return Z;
	});
	return ctx;
};

var makeRenamer = function(obj, ctx) {
	var remap = obj.rename;
	var defaults = obj.defaults;
	var polite = obj.polite;
	var doCloning = !!ctx.clone;


	if(!_.isObject(remap)) {
		ctx.failed = true;
		ctx.failures.push("rename expects a map (json object)");
		return null;
	}

	var FN = function(aCtx) {
		aCtx.outp = _.map(aCtx.inp, function(iZ) {
			var Z = (doCloning? _.clone(iZ) : iZ);
			_.each(remap, function(to,from) {
				if(polite && (!_.isUndefined(Z[to]) || _.isUndefined(Z[from]))) 
					return; // skip
				Z[ to ] = Z[from];
				if(_.isUndefined(Z[to]) && defaults) {
					Z[to] = _.isObject(defaults) ? defaults[to] : defaults;
				}
				delete Z[from];
			});
			return Z;
	   });
		return aCtx;
	};
	FN.isFunctionated = true;
	return FN;
}

var makeArrayBuilder = function(arr, ctx) {
	var funcs = _.map(arr, function(f) { return functionator(f, ctx); });
	if(ctx.failed) return null;

	var FN = function(aCtx) {
		var allCtx = _.map(funcs, function(f) {
			var nCtx = context(aCtx.inp);
			return f(nCtx);
		});

		aCtx.outp = [];
		_.each(allCtx, function(ctx,i) {
			if(ctx.failed) {
				aCtx.failed = true;
				aCtx.failures.concat( _.map(ctx.failures, function(ff) { return "[slice " +i+"] "+ff;}) );
			}
			aCtx.outp.push(ctx.outp);
		});
		return aCtx;
	};
	FN.isFunctionated = true;
	return FN;
};


var makeMapper = function(obj, ctx) {
	var mapFN = functionator(obj.map);
	var withFN = _.isUndefined(obj['with']) ? null : makePicker(obj['with'], ctx);

	if(ctx.failed) return null;
	if(mapFN) {

		var FN = function(aCtx) {
			if(withFN) {
				aCtx = withFN(aCtx);
			}
			aCtx.outp = _.map(aCtx.inp, function(Z) {
				var ctZ = context(Z);
				mapFN(ctZ);
				if(ctZ.failed) {
					aCtx.failed = true;
					aCtx.failures = aCtx.failures.concat(_.map(aCtx.failures), function(failure) { return "[mapper]"+failure; });
					return undefined;
				}else{
					return ctZ.outp;
				}
			});
			return aCtx;
		};
		FN.isFunctionated = true;
		return FN;
	}else{
		ctx.failed=true;
		ctx.failures.push("map instruction is not functionable");
		return null;
	};
};
exports.makeMapper = makeMapper;


var makePicker = function(picks, ctx) {
	if(_.isArray(picks)) {
		var bad = _.find(picks, function(x) { return !_.isNumber(x) || x < 0; });
		if(bad) {
			ctx.failed = true;
			ctx.failures.push("with: must be an array of positive numbers");
			return null;
		}
		var pmax = _.max(picks);
		var FN = function(aCtx) {
			if(aCtx.inp.length < pmax) {
				aCtx.failed = true;
				aCtx.failures.push("Data is of size " + actx.inp.length + " but " + pmax + " is expected");
				return aCtx;
			}else{
				var data = _.map(picks, function(i) { return aCtx.inp[i]; });
				var nCtx = context(data);
				nCtx.failed = aCtx.failed;
				nCtx.failures = _.clone(aCtx.failures);
				return nCtx;
			}
		};
		// this is not meant to be functionated
		return FN;
	}else{
		if(_.isNumber(picks) && picks >=0) {
			var pick1 = picks;
			var FN = function(aCtx) {
				if(aCtx.inp.length < pick1) {
					aCtx.failed = true;
					aCtx.failures.push("Data ought to be array of size " + (pick1+1) + " or greater");
					return aCtx;
				}else{
					var data = aCtx.inp[pick1];
					var nCtx = context([data]);
					nCtx.failed = aCtx.failed
					nCtx.failures = _.clone(aCtx.failures);
					return nCtx;
				}
			};
			// this is not meant to be functionated
			return FN;
		}else{
			ctx.failed =true;
			ctx.failures.push("with: must be a positive number");
			return null;
		}
	}
}


var makeSpecialOperation = function(obj, ctx) {
	//f [upper, lower, length, num, join, regexp]  / set

	function arrayfier(mFN) {
		var FN =  function(aCtx) {
			if(_.isArray(aCtx.inp)) {
				aCtx.outp = _.map(aCtx.inp, mFN);
			}else{
				aCtx.outp = mFN(aCtx.inp);
			}
			return aCtx;
		};
		FN.isFunctionated = true;
		return FN;
	}
	if(obj.f) {
		var baseF = obj.f == 'lower' ? function(x) { return x.toLowerCase() } :
			obj.f == 'upper' ? function(x) { return x.toUpperCase();} :
			obj.f == 'length' ? function(x) { return x.length; } : 
			obj.f == 'num' ? function(x) { return parseFloat(x); } : 
			null;

		if(!baseF && obj.f == 'regexp') {
			if(obj.match) {
				var rgp  = obj.mod ? new RegExp(obj.match, obj.mod) : new RegExp(obj.match);
				var repl = obj.replace;
				baseF = _.isUndefined(obj.replace) ?
					function(x) { if(x) return !!(x.toString().match(rgp)); return false; } :
					function(x) { if(x) return x.toString().replace(rpg, repl); return undefined; }
			
			}else{
				ctx.failed = true;
				ctx.failures.push("for f:regex, the match parameter is required");
				return null;
			}
		}
		if(baseF) {
			if(obj.field || obj.fields) {
				var fields = obj.fields || obj.field;
				if(_.isArray(fields)) {
					fields = _.reduce(fields, function(m,x) { m[x] = x; return m; }, {});
				}else if(_.isString(fields)) {
					var x= {};
					x[fields]=fields;
					fields = x;
				}else if(!_.isObject(fields)) {
					ctx.failed =true;
					ctx.failures.push("for f:" + obj.f + " the fields attribute ought to be a map");
					return null;
				}

				var mFN = function(item) { 
					var x = _.cloneDeep(item); 
					_.each(fields, function(to,from) { x[to] = baseF(x[from]) });
					return x;
				};
				return arrayfier(mFN);
			}else if(obj.from) {
				var from = obj.from;
				var loop = _.isArray(from);
				var mFN =  function(item) {
					if(loop) {
						return _.map(from, function(k) { return baseF(item[k]); });
					}else{
						return baseF(item[from]);
					}
				};
				
				return arrayfier(mFN);
			}else{
				ctx.failed = true;
				ctx.failures.push("for f: " + obj.f + " the fields attribute ought to be a map and is required");
				return null;
			}
			
		}else{
			ctx.failed = true;
			ctx.failures.push("could not interpret f:" + obj.f);
			return null;
		}
	}
}

function makeGrep(obj, ctx) {
	var grep = obj.grep || obj.where;
	var select = obj.select;


	var noGrep = _.isUndefined(grep);

	grep = noGrep ? grep : functionator(grep, ctx);

	if(_.isArray(select)) {
		select = _.reduce(select, function(m,x) { m[x] = x; return m; }, {});
	}else if(select && !_.isObject(select)) {
		ctx.failed = true;
		ctx.failures.push("select: when specified, must be a list or a map");
		return null;	
	}

	var selector = select ? function(x) { var m = {}; _.each(select, function(v,k) { m[v] = x[k]; }); return m; } :
	                        function(x) { return x; };

	if(!ctx.failed) {
		var FN = function(aCtx) {
			var ctxGrep = context(aCtx.inp);
			var tests = noGrep ? null : grep(ctxGrep);
			if(!ctxGrep.failed) {
				var outp = [];
				if(noGrep) {
					outp = aCtx.inp;
				}else{
					_.each(tests.outp, function(b,i) {
						if(b) outp.push(aCtx.inp[i]);
					});
				}
				aCtx.outp = select ? _.map(outp, selector) : outp;
				return aCtx;
			}else{
				aCtx.failed = true;
				aCtx.failures.concat(ctxGrep.failures);
				return aCtx;
			}
		};
		FN.isFunctionated = true;
		return FN;
	}
	return null;
}

function makeConditional(obj, ctx) {
	var iff = obj.if;
	var then = obj.then;
	var elsse = obj.else;



	iff = functionator(iff, ctx);
	console.log(ctx);
	if(!ctx.failed) {
		then = functionator(then, ctx);
		console.log(ctx);
		if(!ctx.failed) {
			elsse = functionator(elsse, ctx) ;
			console.log(ctx);
			if(!ctx.failed) {
				var FN = function(aCtx) { 
					var ctxIFF = context(aCtx.inp);
					var tests = iff(ctxIFF);
					if(!ctxIFF.failed) {
						var valsTHEN = [], valsELSSE = [], valsREV = [];
						_.each(ctxIFF.outp, function(b,i) {
							var v = b ? valsTHEN : valsELSSE;
							valsREV.push(v.length);
							v.push(aCtx.inp[i]);
						});
						ctxTHEN = context(valsTHEN);
						ctxELSSE = context(valsELSSE);
						then(ctxTHEN);
						elsse(ctxELSSE);
						if(ctxTHEN.failed || ctxELSSE.failed) {
							aCtx.failed = true;
							if(ctxTHEN)  aCtx.failures = aCtx.failures.concat( _.map(ctxTHEN.failures, function (x) { return "in 'then': " + x}));
							if(ctxELSSE) aCtx.failures = aCtx.failures.contact(_.map(ctxELSSE.failures, function(x) { return "in 'else': " + x }));
							return aCtx;
						}else{
							var outp = _.map(ctxIFF.outp, function(b,i) {
									var v = b ? ctxTHEN.outp : ctxELSSE.outp;
									return v[ valsREV[i] ];
							});
							aCtx.outp = outp;
							return aCtx;
						}
					}else{
						aCtx.failed = true;
						aCtx.failures = aCtx.failures.concat(_.map(ctxIFF.failures, function(x) { return "in 'if': " + x }));
						return aCtx;
					}
				};
				FN.isFunctionated = true;
				return FN;
			}
		}
	}
	return null;
}


var functionator = function(obj,ctx) {
	if(obj && obj.isFunctionated) {
		return obj;
	}
	if(!ctx) { ctx = context([]); }

	if(_.isArray(obj)) {
		return makeArrayBuilder(obj, ctx);
	}else if(_.isObject(obj)) {
		if(obj.pluck) {
			return makePlucker(obj,ctx);
		}else if(obj.rename) {
			return makeRenamer(obj,ctx);
		}else if(obj.map) {
			return makeMapper(obj,ctx);
		}else if(obj.if) {
			return makeConditional(obj,ctx);
		}else if(obj.join) { 
			return makeJoin(obj, ctx);
		}else if(obj.chain) {
			return makeChain(obj, ctx);
		}else if(obj.f) {
			return makeSpecialOperation(obj, ctx);
		}else if(obj.grep || ((obj.select || obj.where) && ! obj.join)) {
			return makeGrep(obj,ctx);
		}
	} 
	return null;
};
exports.functionator = functionator;


var cartesian2 = function(a1, a2) {
	return _.reduce(a1, function(list, x1) {
		return _.reduce(a2, function(list1, x2) {
			list1.push( [ x1, x2 ]);
			return list1;
		}, list);
	},[]);
};
exports.cartesian2 = cartesian2;

var longCartesian = function(as) {
	var empty = _.isUndefined(as) || _.isNull(as) || as.length == 0;
	if(!empty) empty = _.find(as, function(x) { return _.isUndefined(x) || _.isNull(x) || x.length ==0 } );
	if(empty) return [];

	var outs = _.clone(as[0]);
	for(var i = 1; i<as.length; i++) {
		outs = exports.cartesian2(outs, as[i]);
		if(i>1) {
			outs = _.map(outs, function(x) {
				var y = _.clone(x[0]);
				y.push(x[1]);
				return y;
			});
		}
	}
	return outs;
};
exports.longCartesian = longCartesian;

// provide a function to merge outut of longCartesian into single objects
function makeMerger(join, select) {
	if(select) {
		return function(cartOuts) {
			return _.map(cartOuts, function(outs){
				var out = {};
				_.each(join, function(k,i) {
					var sels = seletct[k];
					_.each(sels, function(to,from){
						out[to] = outs[i][from];
					});
				});
				return out;
			});
		}
	}else{
		return function(cartOuts) {
			return _.map(cartOuts, function(outs) {
				var out = {};
				_.each(join,function(k,i){
					_.each(_.keys(outs[i]), function(x) {
						to[x] = outs[i][x];
					});
				});
				return out;
			});
		};
	}
}

exports.makeJoiner = function(obj, ctx) {
	var join = obj.join;
	var select = obj.select;
	var onArray = obj.on;
	var withFN = _.isUndefined(obj['with']) ? null : makePicker(obj['with'], ctx);

	if(ctx.failed) return null;
	// 0. expected types
	assert(ctx, 'join must be an array', 'isArray', join);
	assert(ctx, 'on must be an array', 'isArray', onArray);
	if(select) assert(ctx, 'select must be a map', isMap, select);
	if(ctx.failed) return null;
	
	// 1. all members of select must be names that are in join
	var selectKeys = _.keys(select);
	assert(ctx, 'select must use keys from join', 
		_.intersection(selectKeys, join).length == _.min(join.length, selectKeys.length));
	if(ctx.failed) return null;

	// 2. the size of join and onArray must be identical
	assert(ctx, 'join and onArray must be of same size', join.length == onArray.length);
	if(ctx.failed) return null;

	// 3. the input must be an array whose size is the same as join
	assert(ctx, 'input data must be an array (of arrays)', 'isArray', ctx.inp);
	if(ctx.failed) return null;

	var parts = _.partition(ctx.inp, function(x) { return _.isArray(x); });
	assert(ctx, 'input data must be an array with arrays, same number of arrays as number of join element', 
		parts[0].length == 0 && parts[1].length == join.length);

	if(ctx.failed) return null;

	//4. all members of 'on' must be functionable
	var keyCalculators = _.map(onArray, function(on) { return functionator(on, ctx); });
	// are there null functionated ? I mean - did we fail for at least ?
	var nulls = _.findIndex(keyCalculates, function(x) { return _.isNull(x); });
	assert(ctx, 'all on-keys must be functionable', nulls<0);
	if(ctx.failed) return null;



	var FN = function(aCtx) {

		if(withFN) {
			aCtx = withFN(aCtx);
			if(aCtx.failed) return aCtx;
		}
		if(join.length == aCtx.inp.length) {
			var keyContext = _.map( keyCalulators, function(calc, i){
				var ctx_i = calc(context( aCtx.inp[i] ) );
				if(ctx_i.failed) return undefined;

				return _.reduce(ctx_i.outp, function(m, outp_j, j) {
						if(!m[outp_j]) m[outp_j] = [];
						m[outp_j].push(ctx_i.inp[j]);
						return m;
					},{});
				});

			var keys = _.keys(keyContext[0]);

			var outs = [];
			_.each(keys, function(K) {
				var vals = _.pluck(K, keyContext);
				// outer join not supported yet
				vals = exports.longCartesian(vals);
				if(vals && vals.length>0) {
					outs.push(vals);
				}
			});

			aCtx.outp = makeMerger(join,select)(outs);
			return aCtx;
		}else{
			aCtx.failed =true;
			aCtx.failures.push(["join operation expect " + join.length + " paramers but " + aCtx.inp.length + " were passed"]);
			return aCtx;
		}
	};
	FN.isFunctionated = true;

	return FN;

}


exports.examples = {
	'alice' : [ {a:1, b:1}, {a:2, b:4}, {a:3, b:9}, {a:4, b:16} ],
	'bob' : [ { A: 'S0', B:7 }, {A: 'S3', B:10}, {A:'F7', B:11 } ],
	'clint': [ { U: "joe", age: 16}, {U: "mark", age: 45 }, {U: "zabou", age:29}, {U:"dave", age: 8} ],
	'barb': [ { user: "joe", city: 'Chicago'}, {user: "dave", city: 'Boston' }, {user: 'zabou', city: 'Paris'}, { user: 'mark', city: 'London'}]
};
