var _ = require('lodash');


// assert allows to program test and feed error messages when compiling a function
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

// a  context is required for about everything
var context = function(data, mode, doneFN) {
	var isArray = _.isArray(data);
	var isScalar = _.isString(data) || _.isNumber(data);
	

	var failures = [];
// debugger;
	if(_.isUndefined(mode) || _.isNull(mode)) { 
		if(isArray) {
			if(data.length>0) {
				if(_.isArray(data[0])) {
					var nonArray = _.find(data, function(x)  { return !_.isArray(x); });
					if(nonArray) failures.push('not an streamset');
					        else mode = 'streamset';

				}else if(_.isObject(data[0])) {
					var nonObject = _.find(data, function(x) { return _.isArray(x) || !_.isObject(x); });
					if(nonObject) failures.push('not a stream');
					         else mode = 'stream';
				}else if(_.isString(data[0]) || _.isNumber(data[0])) {
					var nonScalar = _.find(data, function(x) { return !(_.isString(x) || _.isNumber(x))});
					if(nonScalar) {failures.push('not a stream of scalars'); }
					         else mode = 'stream';
				}
			}else{
				mode = 'stream';
			}
		}else if(isScalar) {
			mode = 'scalar';
		}else if(_.isObject(data)) { 
			var hasArrays = hasObjects = hasScalars = false;
			for(var key in data) {
				if(_.isArray(data[key])) {
					hasArrays = true;
				}else if(_.isObject(data[key])) {
					hasObjects = true;
				}else if(_.isString(data[key]) || _.isNumber(data[key]) || _.isBoolean(data[key])) {
					hasScalars = true;
				}else{
					failures.push('map has surprising type');
					break;
				}

			}
			
			mode = hasArrays && (! (hasScalars || hasObjects) ) ? 'map' : (hasScalars || hasObjects ? 'object' : 'unsupported');
			if(mode == 'unsupported') {
				console.log("Unsupported mode for context:");
				console.log(data);
			}
			
		}else if(_.isUndefined(data)) {
			data = [];
			mode = 'stream';
		}else{
			mode = 'unsupported';
			failures.push("data is of undeterminate type");
		}
	}
	var failed = failures.length>0;
	var xx = { inp: data, clone: true, outp: [], failures: failures, failed: failed, mode: mode};
	if(_.isFunction(doneFN)) {
		doneFN.bind(xx);
		xx.done = doneFN;
	}
	
	return xx;
};
exports.context = context;


// for the "with" construct, we'll have to resort to the below...
function contextNewInput(ctx, newInput) {

	var ntx = context(newInput);
	ntx.outp = ctx.outp;
	ntx.failures = ctx.failures;
	ntx.failed   = ctx.failed;
	ntx.clone    = ctx.clone;
	if(ctx.lambda) ntx.lambda = ctx.lambda;
	if(ctx.done) {
		ctx.done.bind(ntx);
		ntx.done = ctx.done;
	}

	return ntx;
}

// helper function to fail a context and return a null
function nullForFailure(ctx, failure) {
	ctx.failed = true;
	ctx.failures.push(failure);
	return null;
}

var makeDebugger = function(obj, ctx) {
	
	var FN1 = functionator(obj,ctx);
	var FN0 = function(aCtx) {
		debugger;
		return FN1(aCtx);
	}
	return FN0;
}

var makeZipper = function(obj, ctx) {
		// this operation will support the 'with:' wizardry
	var debug = !!obj.debug;
	var withFN = _.isUndefined(obj.with) ? function(x) { return x; } : makePicker(obj.with, ctx);
	if(ctx.failed) return null;
	var repeat = !!(obj.repeat)

    var builder = null;
	if(_.isArray(obj.zip)) {
		if(obj.zip.length==0) {
			builder = function(list) { return list;};
		}else{
			var notString = _.find(obj.zip, function(x) { return !_.isString(x); });
			if(notString) {
				ctx.failed = true;
				return nullForFailure(ctx,"zip array contains non-strings");
			}
			var fields = _.clone(obj.zip);
			function mkBuilder(fields) {
				return function(list) { return _.reduce(fields, function(m, f, i) { if(f!=null) m[f] = list[i]; return m;},{}); };
			}
			builder = mkBuilder(fields);
		}
	}else{
		return nullForFailure(ctx,"zip must be specified with an array");
	}
	var FN = function(aCtx) {
		if(debug) { debugger; }
		aCtx = withFN(aCtx);
		if(aCtx.failed) return aCtx;

		if(aCtx.mode == 'streamset') {
			var maxLength = _.reduce(aCtx.inp, function(ml, list) { if(list && list.length && list.length>ml) ml = list.length; return ml; }, 0);
			var outp = [];
			for(var i = 0; i< maxLength; i++) {
				var list=_.reduce(aCtx.inp, function(row, inpList) { 
					var val = repeat? inpList[ i % inpList.length ] : inpList[i];
					row.push(val);
					return row;
				},[]);
				outp.push( builder(list) );
			}
			aCtx.outp = outp;
			return aCtx;
		}else{
			nullForFailure(aCtx, "input data is not a streamset");
			return aCtx;
		}
	};
	FN.isFunctionated = true;
	return FN;
}


// prepare a function that extract data from a complex object along a path...
function makeExtractorStep(path) {
	if(_.isString(path) || _.isNumber(path)) {
		return function(obj,ctx) {
		  	try {
				return _.isNull(obj) || _.isUndefined(obj) ? null : (_.isObject(obj) ? obj[path] : null ) ;
			}catch(err) {
				ctx.failed =true;
				ctx.failures.push("extractor: " + err);
				return null;
			}
		};
	}else if (_.isArray(path)) {
		var steps = _.map(path, makeExtractorStep);
		return function(obj, ctx) {
			for(var i=0; i<steps.length;i++) {
				obj = steps[i] (obj, ctx);
			}
			return obj;
		}
	}else if(_.isObject(path)) {
		var steps = _.reduce(path, function(map, p,f) {
			map[f] = makeExtractorStep(p);
			return map;
		},{});
		return function(obj,ctx) {
			return _.reduce(steps, function(outObj, p_x,f) {
				outObj[f] = p_x(obj, ctx);
				return outObj;
			},{});
		};
	}else{
		return function(x,ctx) { ctx.failed=true; ctx.failures.push("null step in extractor"); return null; }
	}
	
}


// how "spreading" will work with pluck ... 
function makeReduceSpreader(spreadKey) {
	return function(list, item) {
		if(!item) return list;
		var sublist = item[spreadKey];
		if(sublist && _.isArray(sublist)) {
			var template = _.clone(item);
			delete template[spreadKey];
			_.each(sublist, function(x) {
				var instance = _.clone(template);
				instance[spreadKey] = x;
				list.push(instance);
			});
		}else{
			list.push(item);
		}
		return list;
	}
}
/** makePlucker: provide a function that will act as "pluck" on a stream of map elements, returning a stream (usually, a stream of scalars).
 in scalar context, fail.
 in map context, return single element for the key (possibly: undefined)
 */
var makePlucker = function (obj, ctx) {
		// this operation will support the 'with:' wizardry
	var withFN = _.isUndefined(obj.with) ? function(x) { return x; } : makePicker(obj.with, ctx);
	if(ctx.failed) return null;



	
	var plKey = obj.pluck;
	var pickList = obj.pick;
	var spreading = !!obj.spread
	if(spreading && !(_.isString(obj.spread))) {
		ctx.failures.push("spread must be a string");
		ctx.failed = true;
		return null;
	}
	var spreader = spreading ? makeReduceSpreader(obj.spread) : null;

	var isPlain = _.isString(plKey);
	
	var extractor = null;
	if(pickList) {
		var issue = null;
		if(_.isArray(pickList) && pickList.length>0) {
			if(_.isArray(plKey) && plKey.length ==0) {
				var def = obj.defaults || {};
				
				extractor = function(x, aCtx) {
					if(!_.isObject(x)) return null;
					return _.reduce(pickList, function(m,k) {
						m[k] = x[k]; return m;
					}, _.clone(def));
				};
				
			}else{
				issue = "for pluck with option 'pick', the pluck value must be []...";
			}
		}else{
			issue = "for pluck with option 'pick', the pick value must be an array of strings or positions";
		}
		if(issue) { 
			ctx.failed = true;
			ctx.failures.push(issue);
			return null;
		}
	}else if(!isPlain) {
		extractor = makeExtractorStep(plKey);
	}
	


	 var FN = function(aCtx) { 
	 	aCtx = withFN(aCtx);
		if(aCtx.failed) return aCtx;

	 	if(aCtx.mode == 'stream') {
	 		if(isPlain) {
				aCtx.outp = _.pluck(aCtx.inp, plKey);
			}else{
				aCtx.outp = _.map(aCtx.inp, function(x) { 
					 return extractor(x, aCtx); });
			}
		}else if(aCtx.mode =='map' || aCtx.mode=='object') {
			if(isPlain) {
				aCtx.outp = aCtx.inp[ plKey ];
			}else{
				aCtx.outp = extractor(aCtx.inp, aCtx);
			}
		}else{
			aCtx.failed = true;
			aCtx.failures.push("pluck in scalar mode ("+aCtx.mode+") is not supported.");
		}
		if(spreading) {
			aCtx.outp = _.reduce(aCtx.outp, spreader, []);
		}
		return aCtx;
	};
	FN.isFunctionated = true;
	return FN;
};

var makeChain = function(obj, ctx) {

	// this operation will support the 'with:' wizardry
	var withFN = _.isUndefined(obj.with) ? function(x) { return x; } : makePicker(obj.with, ctx);
	var debug = !!obj.debugger;
	if(ctx.failed) return null;


	

	if(_.isArray(obj.chain)) {
		var funcs = _.map(obj.chain, function(f) { return functionator(f, ctx); });
		if(ctx.failed) {
			ctx.failures.push("chain must get only functionables");
			return null;
		}
		var FN = function(aCtx) {
			aCtx = withFN(aCtx);
			if(aCtx.failed) return aCtx;

			var funcsLength = funcs.length;
			var cctx = context(aCtx.inp);
			cctx.lambda = aCtx.lambda;
			for(var i=0; i<funcsLength && !cctx.failed;i++, cctx = context(cctx.outp)) {
				if(debug) { debugger; }
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


/** provide a renamer function, for a stream of json elements (maps)
  in scalar context: fail
  in map context: provide json element with the renamed attributes
  */
var makeRenamer = function(obj, ctx) {
	var remap = obj.rename;
	var defaults = obj.defaults;
	var polite = obj.polite;
	var doCloning = !!ctx.clone;
	var withFN = null;

	// this operation will support the 'with:' wizardry
	var withFN = _.isUndefined(obj.with) ? function(x) { return x; } : makePicker(obj.with, ctx);
	if(ctx.failed) return null;


	var def = defaults || {};


	var renamer = _.isArray(remap) ?
		function(iZ) {
			if(_.isArray(iZ)) {
				return _.reduce(remap, function(m,k,i){
					m[k] = iZ[i];
				}, _.clone(def));
			}else{
				return iZ;
			}
		}:
		
		_.isString(remap) ? 
			function(iZ) {
				var q = _.clone(def);
				q[remap] = iZ;
				return q;
			} :
			
		_.isObject(remap) ? 	
	
	function(iZ) {
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
   } :
   	null;
	   
	if(_.isNull(renamer)) {
		ctx.failed = true;
		ctx.failures.push("rename expects a map (json object), a single string or an array of strings");
		return null;
	}


	var FN = function(aCtx) {
		
		aCtx = withFN(aCtx);
		if(aCtx.failed) return aCtx;

		if(aCtx.mode == 'stream') {
			aCtx.outp = _.map(aCtx.inp, renamer);
		}else if(aCtx.mode == 'map' || aCtx.mode=='object') {
			aCtx.outp = renamer(aCtx.inp);
		}else{
			aCtx.failed = true;
			aCtx.failures.push("renamer cannot be applied in mode " + aCtx.mode);
		}
		return aCtx;
	};
	FN.isFunctionated = true;
	return FN;
}

/** provide an ArrayBuilder, which is a 'context transaparent' operation */
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
	var mapFN = functionator(obj.map,ctx);
	// this operation will support the 'with:' wizardry
	var withFN = _.isUndefined(obj.with) ? function(x) { return x; } : makePicker(obj.with, ctx);
	if(ctx.failed) return null;


	if(mapFN) {

		var FN = function(aCtx) {
			aCtx = withFN(aCtx);
			if(aCtx.failed) return aCtx;

			if(aCtx.mode != 'streamset' && aCtx.mode != 'stream') {
				aCtx.failures.push("mapper can only be used in stream or streamset mode");
				aCtx.failed=true;
				return aCtx;
			}

			aCtx.outp = _.map(aCtx.inp, function(Z) {
				var ctZ = context(Z);
				// debugger;
				ctZ = mapFN(ctZ);
				if(ctZ.failed) {
					aCtx.failed = true;
					aCtx.failures = aCtx.failures.concat(_.map(ctZ.failures, function(failure) { return "[mapper]"+failure; }));
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


// for "with" operator, we can specify:
// a number or a lambda parameter ({'$': 'a'}), or a literal ( {'#': 'bonjour'})
function isPickable(x, ctx) {
	if(_.isNumber(x)) {
		return x == Math.floor(x) && x >=0;
	}
	if(_.isObject(x)) {
		if(!_.isUndefined(x['$'])) {
			return !_.isUndefined(ctx.lambda[ x['$'] ]);
		}
		if(!_.isUndefined( x['#'] )) {
			return true;
		}
	}
	if(_.isString(x)) { return true;}
	return false;
}


var makePicker = function(picks, ctx) {


	
	if(_.isArray(picks)) {
		var bad = _.find(picks, function(x) { return !isPickable(x,ctx)});
		if(bad || picks.length == 0) {
			ctx.failed = true;
			ctx.failures.push("with: must be an array of positive numbers, literals or lambda parameters");
			return null;
		}
		// we cannot mix numbers and lambda parameters
		var numberOne = !_.isUndefined( _.find(picks, function(x) {return _.isNumber(x); }) );
		var lambdaOne = _.find(picks, function(x) {return _.isObject(x) && !_.isUndefined(x['$'])});
		var literalOne = _.find(picks, function(x) {return _.isObject(x) && _.isUndefined(x['$']) && ! _.isUndefined(x['#']); });
		var stringOne = _.find(picks, function(x) { return _.isString(x); });

		var failure = 
		  (lambdaOne && numberOne) ? 'lambda parameters and positional parameters' :
		  (lambdaOne && stringOne) ? 'lambda parameters and field-name parameters' :
		  (numberOne && stringOne ) ? 'positional parameters and field-name parameters' : null;

		if(failure) {
			ctx.failed = true;
			ctx.failures.push("with: cannot mix " + failure);
			return null;
		}


		if(numberOne) {
			var literals = _.filter(picks, function(x) { return _.isObject(x) && !_.isUndefined(x['#'])});
			var numbers = _.filter(picks, function(x) { return _.isNumber(x); });
			var pmax = _.max(numbers);

			var FN = function(aCtx) {

				function mkSeedArray(size, value) {
					var sa = [];
					for(var i =0; i<size; i++) sa.push(value);
					return sa;
				}

				if(aCtx.inp.length < pmax) {
					aCtx.failed = true;
					aCtx.failures.push("Data is of size " + actx.inp.length + " but " + pmax + " is expected");
					return aCtx;
				}else{
					// In streamset - build a new streamset, expanding literals (if any) to the max length of all streams.
					// at this point, do not handle the case of streams of different length
					if(aCtx.mode == 'streamset') {
						var maxLength = _.reduce(picks, function(ml, i) { 
							if(_.isNumber(i) && _.isArray(aCtx.inp[i])) {
								return aCtx.inp[i].length > ml ? aCtx.inp[i].length : ml; 
							}else{
								return ml;
							}
						},0);
						var seedArray = [];
						if(literalOne) { // if there is at least one literal spec, prepare a big array to use realize it
							seedArray = mkSeedArray(maxLength, literalOne['#']);
						}

						var data = _.map(picks, function(i) { 
							if(_.isNumber(i)) return aCtx.inp[i]; 
							else if( !_.isUndefined(i['#'])  && literalOne) {
								if(i['#'] == literalOne['#']) {
									return seedArray;
								}else{
									var q = i['#'];
									return _.map(seedArray, function() { return q; });
								}
							}
							return undefined;
						});

						var nCtx = context(data);
						nCtx.failed = aCtx.failed;
						nCtx.failures = _.clone(aCtx.failures);
						nCtx.lambda   = aCtx.lambda;
						return nCtx;
					}else if(aCtx.mode == 'stream') {
						data = _.map(picks, function(i) {
							if(_.isNumber(i)) return aCtx.inp[i];
							if(i['#']) return i['#'];
							return undefined;
						});
						var nCtx = context(data);
						nCtx.failed = aCtx.failed;
						nCtx.failures = _.clone(aCtx.failures);
						nCtx.lambda   = aCtx.lambda;
						return nCtx;
					}else{
						aCtx.failed = true;
						aCtx.failures.push("cannot use 'with' in mode " + aCtx.mode);
						return aCtx;
					}
				}

			};
			// this is not meant to be functionated
			return FN;
		}else if(lambdaOne) {

			var badLambdas = _.filter(picks, function(i) { return _.isObject(i) && !_.isUndefined(i['$']) && _.isUndefined( ctx.lambda[ i['$'] ] ) ; });
			if(badLambdas && badLambdas.length>0) {
				ctx.failed = true;
				ctx.failures.push("Lambda symbols are not declared: " + badLambdas.join(", "));
				return null;
			}
			

			var FN = function(aCtx) {
				var lambda = aCtx.lambda;
				// debugger;
				var modes = {};
				var dataPrep = _.map(picks, function(i) {
					if(_.isObject(i) && !_.isUndefined(i['$'])) {
						var l = i['$'];
						if(_.isArray(l)) {
							modes['stream'] = true;
						}else if(_.isObject(l)) {
							for(var f in l) {
								if(_.isString(l[f]) || _.isNumber(l[f])) {
									modes['object'] = true;
								}else{
									modes['map'] = true;
								}
								break;
							}
						}
						return lambda[ l ];
					}else if(_.isObject(i) && !_.isUndefined(i['#'])) {
						return i['#'];
					}
				});

				var data = dataPrep;

				if(modes.stream && ! (modes.map || modes.object)) {
					// when all data is streams, we want to be building a stream set - so let's extent the "literal ones" to streams.
					if(literalOne) {
						var maxLength = _.reduce(dataPrep, function(ml, strm, i) {
							if(_.isObject(picks[i]) && !_.isUndefined(picks[i]['$']) && _.isArray(strm)) {
								ml = strm.length > ml ? strm.length: ml;
							}
							return ml;
						}, 0);
						var seedArray = mkSeedArray(maxLength, literalOne['#']);
						
						data = _.map(dataPrep, function(dat, i) {
							if(_.isObject(picks[i]) && !_.isUndefined(picks[i]['#'])) {
								return (dat == literalOne['#'] ? seedArray : _.map(seedArray, function() { return dat; }));
							}else{
								return dat;
							}
						});
					}
				}
				return nCtx = contextNewInput(data);				
			};
			return FN;
		}else if(stringOne) { // pick stuff by fieldname
			// are we mixing strings and constants?
			if(literalOne) {
				// that is a little arduous - so, we'll take it slow
				var choice = _.map(picks, function(x) { return _.isObject(x) ? { literal: true, val: x['#'] } : { literal: false, val: x }; });
				var FN = function(aCtx) {
					if(aCtx.mode == 'stream') {
						var inp = _.map(aCtx.inp, function(item) {
							return _.map(choice, function(ch) {
								return ch.literal ? ch.val : item[ch.val];
							});
						});
						
						return contextNewInput(aCtx, inp);
					}else{
						aCtx.failed = true;
						aCtx.failures.push("with: operation with field name supported only in stream mode");
						return aCtx;
					}
				};
				return FN;
			}else{
				// only field names
				var fNames = _.clone(picks);
				var FN = function(aCtx) {
					if(aCtx.mode=='stream') {
						var inp = _.map(aCtx.inp, function(item) {
							return _.map(fNames, function(n) { return item[n]; });
						});
						return contextNewInput(aCtx, inp);
					}else{
						aCtx.failed =true;
						aCtx.failures.push("with: operation with field names supported only in stream mode");
						return aCtx;
					}
				};
				return FN;
			}
		}else if(literalOne) { // only literals
			var constant = _.map(picks, function(x) { return x['#']});
			var FN = function(aCtx) {
				return contextNewInput(aCtx, constant);
			};
			return FN;
		}else{
			ctx.failed = true;
			ctx.failures.push("could not interpret this 'with' ");
			return null;
		}
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
					return contextNewInput(aCtx, data);
				}
			};
			// this is not meant to be functionated
			return FN;
		}else if(_.isObject(picks)) {
			if(!_.isUndefined(picks['$'])) {
				var l = picks['$'];
				if(_.isUndefined(ctx.lambda[l])) {
					ctx.failed = true;
					ctx.failures.push("with: lambda element " + l + " was not declared in lambda statement");
					return null;
				}else{
					var FN = function(aCtx) {
						var nCtx = contextNewInput(aCtx,  aCtx.lambda[l] );
						return nCtx;
					};
					return FN;
				}
			}else if(!_.isUndefined(picks['#'])) {
				var c = picks['#'];
				var FN = function(aCtx) {
					var nCtx = contextNewInput(aCtx, _.clone(c) );
					return nCtx;
				};
				return FN;
			}else if(!_.isUndefined(picks['_'])) {
				var pos = picks['_'];
				if(_.isNumber(pos)) {
					var FN = function(aCtx) {
						if(_.isArray(aCtx.inp)) {
							var data = aCtx.inp[pos];
							return contextNewInput(aCtx, data);
						}else{
							aCtx.failures.push("with: on position " + pos + ", but data is not a stream or streamset");
							aCtx.failed = true;
						}
						return aCtx;
					};
					return FN;
				}else{
					ctx.failures.push("with: on position ('_') must be numeric [got: " + pos + "]");
					ctx.failed =true;
					return null;
				}
			}else{
				ctx.failures.push("with: single pick that does not make sense ...");
				ctx.failed = true;
				return null;
			}
		}else if(_.isString(picks)) {
			var c= picks;
			var FN = function(aCtx) {
				if(aCtx.mode == 'object' || aCtx.mode == 'map') {
					return contextNewInput(aCtx, aCtx.inp[c]);
				}else{
					return contextNewInput(aCtx, _.pluck(aCtx.inp, c));
				}
			};
			return FN;
		}else{
			ctx.failed =true;
			ctx.failures.push("with: must be a positive number");
			return null;
		}
	}
}
exports.unfunctionatedPicker = makePicker;


var makeSpecialOperation = function(obj, ctx) {
	//f [upper, lower, length, num, join, regexp]  / set

		// this operation will support the 'with:' wizardry
	var debug = obj.debugger;
	var withFN = _.isUndefined(obj.with) ? function(x) { return x; } : makePicker(obj.with, ctx);
	if(ctx.failed) return null;


	// debugger;

	function arrayfier(mFN) {
		var objCache  =debug? obj : null;
		var FN =  function(aCtx) {
			if(debug) { debugger; console.log(objCache); }
			aCtx = withFN(aCtx);
			if(aCtx.failed) return aCtx;

			if(aCtx.mode == 'streamset' || aCtx.mode == 'stream') {
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
			obj.f == 'length' ? function(x) { return x ? x.length : undefined; } : 
			obj.f == 'num' ? function(x) { return parseFloat(x); } : 
			obj.f == 'empty' ? function(x) { return _.isNull(x) || _.isUndefined(x) || (_.isArray(x) && x.length == 0) ||(_.isObject(x) && _.keys(x).length ==0) } :  
			obj.f == 'not-empty' ? function(x) { return !(_.isNull(x) || _.isUndefined(x) || (_.isArray(x) && x.length == 0) ||(_.isObject(x) && _.keys(x).length ==0))} :
			null;

		if(obj.f == '>n' || obj.f == '>=n' || obj.f == '<n' || obj.f == '=<n' || obj.f == '==n') {
			var N = obj.n;
			if(_.isUndefined(N)) {
				return nullForFailure(ctx, "for " + obj.f + ", parameter n must be defined");
			}
			baseF =
				obj.f == '>n' ? function(x) { return x>N; } : 
				obj.f == '<n' ? function(x) { return x<N; } : 
				obj.f == '>=n' ? function(x) { return x>=N; } : 
				obj.f == '=<n' ? function(x) { return x<=N; } : 
				obj.f == '==n' ? function(x) { return x == N; }: 
				baseF;
		}

		if(obj.f == 'shift') {
			var mFN = function(item) {
				// debugger;
				if(item.length && item.length>0) {
					return item[0];
				};
				return undefined;
			};
			return arrayfier(mFN);

		}else if(obj.f == 'pop') {
			var mFN = function(item) {
				if(item.length) {
					return item[item.length-1];
				}
				return undefined;
			};
			return arrayfier(mFN);
		}

		if(!baseF && obj.f == 'regexp') {
			if(obj.match) {
				var rgp  = obj.mod ? new RegExp(obj.match, obj.mod) : new RegExp(obj.match);
				var repl = obj.replace;
				baseF = _.isUndefined(obj.replace) ?
					function(x) { if(x) { return !!(x.toString().match(rgp)); } return false; } :
					function(x) { if(x) return x.toString().replace(rgp, repl); return undefined; }
			
			}else{
				ctx.failed = true;
				ctx.failures.push("for f:regexp, the match parameter is required");
				return null;
			}
		}
		if(!baseF && obj.f == 'paste') {
			var sep = obj.sep || '';
			
			var apply = obj.apply;
			var mFN = null;
			
			if(apply) {
				var applyIssues = [];
				var applyArrays = _.reduce(apply, function(m, fields, from) {
					if(_.isArray(fields)) {
						m[from]=true;
					}else if(_.isString(fields)) {
						m[from]=false;
					}else{
						applyIssues.push("for field "+ from+ ": input fields must be a list or a single field");
					}
					return m;
				},{});
				if(applyIssues.length>0) {
					ctx.failed=true;
					ctx.failures.push("for f:paste, issue with 'apply' :" + applyIssues.join("; "));
					return null;
				}
				
				mFN = function(item) {
					_.each(apply, function(fields, from) {
						if(applyArrays[from]) {
							var inp = _.map(fields, function(f) { return item[f];});
							item[from] = inp.join(sep);
						}else{
							item[from] = (item[fields] && item[fields].join ? item[fields].join(sep) : item[fields]);
						}						
					});
					return item;
				}
				return arrayfier(mFN);
			}
			
			mFN = function(item) {
				if(item && item.join) { return item.join(sep); }
				return item;
			}
			return arrayfier(mFN);
		}
		if(!baseF) {
			var ff = obj.f;
			if(ff=='+' || ff=='*' || ff=='min' || ff == 'max' || ff == '-' || ff == '/' || ff == "||") {
				var ops = 
					ff == '+'   ? { st: 0, red: function(x,y) { return x+y; } } :
					ff == '*'   ? { st: 1, red: function(x,y) { return x*y; } } : 
					ff == 'min' ? { st: null, red: function(x,y) {  return x==null ? y : ( x < y ? x : y); } } : 
					ff == 'max' ? { st: null, red: function(x,y) { return x==null? y: (x>y ? x : y ); }} : 
					ff == '-'   ? { st: null, red: function(x,y) { return x==null? y : x-y; } } :
					ff == '/'   ? { st: null, red: function(x,y) { return x==null ? y : x/y } }:
					ff == "||"  ? { st: "",  red: function(x,y) { return x + y; } } : 
					null;
				if(ops) {
					var fst = ops.st;
					var fred = ops.red;
					var mFN = function(item) {
						return _.reduce(item, fred, fst);
					};
					var FN = function(aCtx) {
						aCtx = withFN(aCtx);
						if(aCtx.failed) return aCtx;
						if(aCtx.mode == 'stream' || aCtx.mode == 'pair' || aCtx.mode == 'array') {
							aCtx.outp = mFN(aCtx.inp);
							return aCtx;
						}else if(aCtx.mode == 'streamset') {
							aCtx.outp = _.map(aCtx.inp, mFN);
							return aCtx;
						}else{
							nullForFailure(aCtx, "only stream and streamset are supported");
							return aCtx;
						}
					};
					FN.isFunctionated = true;
					return FN;
				}
			}
		}
		if(!baseF) {
			if(obj.f == 'id') {
				var mFN = function(item) { 
					return item;
				};
				return arrayfier(mFN);
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
					_.each(fields, function(to,from) {
						 
						x[to] = baseF(x[from]) });
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
						return _.isNull(item)  ? baseF(null) : baseF(item[from]);
					}
				};
				
				return arrayfier(mFN);
			}else{
				var mFN = function(item) {
					return baseF(item);
				};
				return arrayfier(mFN);
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

	// this operation will support the 'with:' wizardry
	var withFN = _.isUndefined(obj.with) ? function(x) { return x; } : makePicker(obj.with, ctx);
	if(ctx.failed) return null;


	
	var noGrep = _.isUndefined(grep);

	grep = noGrep ? grep : functionator(grep, ctx);

	if(_.isArray(select)) {
		select = _.reduce(select, function(m,x) { m[x] = x; return m; }, {});
	}else if(select && !_.isObject(select)) {
		ctx.failed = true;
		ctx.failures.push("select: when specified, must be a list or a map");
		return null;	
	}



	var selector = select ? function(x) { var m = {}; _.each(select, function(v,k) { m[k] = x[v]; }); return m; } :
	                        function(x) { return x; };

	if(!ctx.failed) {
		var FN = function(aCtx) {

			aCtx = withFN(aCtx);
			if(aCtx.failed) return aCtx;


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

function makeDeLambda(obj, ctx) {
	var symbol = obj['$'];
	if(ctx.lambda && !_.isUndefined(ctx.lambda[ symbol ])) {
		var FN = function(aCtx) {
			if(aCtx.lambda) {
				aCtx.outp = aCtx.lambda[symbol];
			}else{
				aCtx.failed = true;
				aCtx.failures.push("lambda expression compromsied");
			}
			return aCtx;
		};
		FN.functionated = true;
		return FN;
	}else if(ctx.lambda) {
		ctx.failed = true;
		ctx.failures.push("lambda: parameter " + symbol + " was not declared.");
		return null;
	}
}

function makeAndOr(obj, ctx) {
	var OR = obj.or;
	var AND = obj.and;
	var skipUndef = obj.undefSkip;


	var tests = _.isUndefined(OR)? AND : OR;
	
	if((!_.isUndefined(OR)) && (!_.isUndefined(AND))) {
		return nullForFailure(ctx, "function can be both an or and and");
	}


	var isOR = _.isUndefined(AND);
	var isAND = ! isOR;

	// how will we make all the ORs and ANDs after all is tested? 
	// we will reduce them with the below reducer
	var reducer = isOR ? 
		(!!skipUndef ? function(boolRed, bool_i) { if(_.isUndefined(bool_i) || _.isNull(bool_i) ){
														return boolRed; 
													}else{
														return boolRed || bool_i;
													}
						} : function(boolRed, bool_i) { return boolRed || bool_i; } ): 
		(!!skipUndef ? function(boolRed, bool_i) { if(_.isUndefined(bool_i) || _.isNull(bool_i) ){
														return boolRed; 
													}else{
														return boolRed && bool_i;
													}
						} : function(boolRed, bool_i) { return boolRed && bool_i; });

	var reducerInit = isAND;


	if(!_.isArray(tests)) {
		return nullForFailure(ctx, (isOR ? "or: " : "and: ") + " operates on array of functionables only ");
	}
	
	var testFNs = _.map(tests, function(t) { return functionator(t,ctx); });
	if(ctx.failed) return null;

	var zipFN = functionator({zip:[]}, ctx);

	var FN = function(aCtx) {
		var allCtx = _.map(testFNs, function(test) {
			var iCtx = context(aCtx.inp, aCtx.mode);
			return test(iCtx);
		});
		_.each(allCtx, function(cx,i) {
			if(cx.failed) {
				aCtx.failed = true;
				var i1th = "(" + (i+1) + (i==0? 'st' : i==1? 'nd' : i==2? 'rd': 'th') + " test) ";
				aCtx.failures = aCtx.failures.concat( _.map(cx.failures, function(ff) { return i1th + ff; }));
			}
		});
		if(allCtx.failed) {
			return aCtx;
		}
		var boolArray = _.reduce(allCtx, function(list, iCtx){
			list.push(iCtx.outp);
			return list;
		},[]);

		var boolCtx = context(boolArray);
		if(boolCtx.mode == 'streamset') {
			var zipped = zipFN(boolCtx);
			if(boolCtx.failed) {
				aCtx.failures = aCtx.failures.concat(_.map(boolCtx.failed, function(ff) { return "[zipping test results]" + ff; }));
				aCtx.failed =true;
				return aCtx;
			}
			var outp = _.map(zipped.outp, function(op) {
				return _.reduce(op, reducer, reducerInit);
			});
			aCtx.outp = outp;
			return aCtx;
		}else{
			aCtx.outp = _.reduce(boolArray, reducer, reducerInit);
			return aCtx;
		}
	};
	FN.isFunctionated = true;
	return FN;
}

function makeConditional(obj, ctx) {
	var iff = obj.if;
	var then = obj.then;
	var elsse = obj.else;


	// this operation will support the 'with:' wizardry
	var withFN = _.isUndefined(obj.with) ? function(x) { return x; } : makePicker(obj.with, ctx);
	if(ctx.failed) return null;



	iff = functionator(iff, ctx);
	// console.log(ctx);
	if(!ctx.failed) {
		then = functionator(then, ctx);
		// console.log(ctx);
		if(!ctx.failed) {
			elsse = functionator(elsse, ctx) ;
			// console.log(ctx);
			if(!ctx.failed) {
				var FN = function(aCtx) { 
					aCtx = withFN(aCtx);
					if(aCtx.failed) return aCtx;

					var ctxIFF = context(aCtx.inp);
					var tests = iff(ctxIFF);
					if(!ctxIFF.failed) {
						var valsTHEN = [], valsELSSE = [], valsREV = [];
						_.each(ctxIFF.outp, function(b,i) {
							var v = b ? valsTHEN : valsELSSE;
							valsREV.push(v.length);
							v.push(aCtx.inp[i]);
						});
						var ctxTHEN = context(valsTHEN);
						var ctxELSSE = context(valsELSSE);
						then(ctxTHEN);
						elsse(ctxELSSE);
						if(ctxTHEN.failed || ctxELSSE.failed) {
							aCtx.failed = true;
							if(ctxTHEN)  aCtx.failures = aCtx.failures.concat( _.map(ctxTHEN.failures, function (x) { return "in 'then': " + x;}));
							if(ctxELSSE) aCtx.failures = aCtx.failures.contact(_.map(ctxELSSE.failures, function(x) { return "in 'else': " + x; }));
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
var makeLambda = function(obj, ctx) {
	var lambda = obj.lambda;
	var value = obj.value;

	if(_.isUndefined(value)) {
		ctx.failed = true;
		ctx.failures.push("lambda: the value parameter must be specified");
		return null;
	}
	if(_.isArray(lambda)) {
		var noStringOne = _.find(lambda, function(x) { return ! _.isString(x); });
		if(noStringOne) {
			ctx.failed = true;
			ctx.failures.push("lambda: the array must be only strings...");
			return;
		}
		if(!ctx.lambda) { 
			ctx.lambda = _.reduce(lambda, function(m, x, i) { m[x] = i; return m;}, {});
		}else{
			_.each(lambda, function(x,i) { 
				if(_.isUndefined(ctx.lambda[x])) {
					ctx.lambda[x] = i;
				}else{
					ctx.failed = true;
					ctx.failures.push("lambda: the variable " + x + " cannot be re-used");
				}
			});
			if(ctx.failed) { 
				return null;
			}
		}
		var mFN = functionator(value, ctx);
		if(ctx.failed) {
			return null;
		}
		var FN = function(aCtx) {
			if(!_.isArray(aCtx.inp) || aCtx.inp.length < lambda.length) {
				aCtx.failed=true;
				aCtx.failures.push("lambda context expects " + lambda.length + " streams or " + lambda.length +  " long array in input. The input is not an array of that size");
				return aCtx;
			}
			if(!aCtx.lambda) { aCtx.lambda = {} }
			aCtx.lambda = _.reduce(lambda, function(m, x, i) {
				if(x != '_') m[x] = aCtx.inp[i];
				return m;
			}, aCtx.lambda);
			return mFN(aCtx);
		};
		FN.functionated = true;
		return FN;
	}else if(_.isString(lambda)) {
		if(!ctx.lambda) ctx.lambda = {};

		ctx.lambda[lambda] = '?';

		var mFN = functionator(value, ctx);
		if(ctx.failed) return null;

		var FN = function(aCtx) {
			if(!aCtx.lambda) { 
				aCtx.lambda = {};
			}
			aCtx.lambda[lambda] = aCtx.inp;
			return mFN(aCtx);
		};
		FN.isFunctionated = true;
		return FN;
	}else{
		ctx.failed = true;
		ctx.failures.push("lambda: only arrays are supported");
		return null;
	}
};


var makeReducer = function(obj, ctx) {
	// this operation will support the 'with:' wizardry
	var withFN = _.isUndefined(obj.with) ? function(x) { return x; } : makePicker(obj.with, ctx);
	if(ctx.failed) return null;

	if(obj.reduce) {
		var redFN = functionator(obj.reduce, ctx);
		if(!redFN) {
			return nullForFailure(ctx, "reduce must be functionable");
		}
		var startingWith = obj.start;
		var skipFailed = !!obj.skipFailed;
		var FN = function(aCtx) {
			if(aCtx.mode = 'stream') {
				var outp = _.reduce(aCtx.inp, function(X, item) {
					// console.log([X,item]);
					if(_.isUndefined(X)) {
						return item;
					}
					var ctx = context([X,item], 'pair');
					// console.log(ctx);	
					var octx = redFN(ctx);

					if(octx.failed) {
						if(skipFailed) return X;
						aCtx.failed = true;
						aCtx.failures.push(octx.failures);
						return undefined;
					}
					return octx.outp;
				}, startingWith);
				aCtx.outp = outp;
				return aCtx;
			}else{
				nullForFailure(aCtx, "only dataset in stream mode are supporting for reduce operations");
				return aCtx;
			}
		};
		FN.isFunctionated = true;
		return FN;
	}
	return nullForFailure(ctx, "bug in makeReducer");
};

var preFunctionators = [];
exports.addPrefunctionator = function(checker, fnator) {
	var z = {};
	z.check = checker;
	z.FN = fnator;
	preFunctionators.push(z);

}

var functionator = function(obj,ctx) {
	if(obj && obj.isFunctionated) {
		return obj;
	}
	if(!ctx) throw new Error("Context must be passed");
	if(ctx.failed) return null;

	for(var i =0; i< preFunctionators.length;i++) {
		if(preFunctionators[i].check(obj)) {
			return preFunctionators[i].FN(obj,ctx, functionator);
		}
	}


	
	var FN = null;

	if(_.isArray(obj)) {
		FN = makeArrayBuilder(obj, ctx);
	}else if(_.isObject(obj)) {
		if(obj["!"]) {
			FN = makeSpecialOperation({f:"id"},ctx);
		}else if(obj.pluck) {
			FN =  makePlucker(obj,ctx);
		}else if(obj.rename) {
			FN =  makeRenamer(obj,ctx);
		}else if(obj.map) {
			FN =  makeMapper(obj,ctx);
		}else if(obj.reduce) {
			FN =  makeReducer(obj, ctx);
		}else if(obj.if) {
			FN = makeConditional(obj,ctx);
		}else if(obj.join) { 
			FN =  makeJoiner(obj, ctx);
		}else if(obj.chain) {
			FN =  makeChain(obj, ctx);
		}else if(obj.zip) {
			FN =  makeZipper(obj, ctx);
		}else if(obj.f) {
			FN =  makeSpecialOperation(obj, ctx);
		}else if(obj.grep || ((obj.select || obj.where) && ! obj.join)) {
			FN =  makeGrep(obj,ctx);
		}else if(obj.lambda) {
			FN =  makeLambda(obj, ctx);
		}else if(!_.isUndefined(obj['$'])) {
			FN =  makeDeLambda(obj, ctx);
		}else if(obj.or || obj.and) {
			FN = makeAndOr(obj,ctx);
		}else if(obj.debug) {
			FN = makeDebugger(obj.debug, ctx);
		}
	} 
	if(FN != null) { 
		FN._code_ = _.clone(obj); 
	}else{
		ctx.failed = true;
		ctx.failures.push("could not interpret " + (_.isArray(obj)? "array" : JSON.stringify(obj)));
	}
	return FN;
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

var longCartesian = function(as, outer) { 
	var empty = _.isUndefined(as) || _.isNull(as) || as.length == 0;
	if(empty) return [];
	var empties = _.filter(as, function(x) { return _.isUndefined(x) || _.isNull(x) || x.length ==0 } );
	if(empties.length>0) debugger;
	if(empties.length>0 && !outer) return [];


	var outs = _.clone(as[0]);
	for(var i = 1; i<as.length; i++) {
		if(!(_.isUndefined(as[i])||_.isNull(as[i]) || as[i].length==0)) {
			outs = exports.cartesian2(outs, as[i]);
			if(i>1) {
				outs = _.map(outs, function(x) {
					var y = _.clone(x[0]);
					y.push(x[1]);
					return y;
				});
			}
		}else{ 
			if(i==1) {
				// when 2nd array has no match - we still need convert to an array like in cartesian2
				outs = _.map(outs, function(x) { return [ x, null ]; });
			}
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
					var sels = select[k];
					_.each(sels, function(from,to){
						if(outs[i]) out[to] = outs[i][from];
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
						if(outs[i]) to[x] = outs[i][x];
					});
				});
				return out;
			});
		};
	}
}

function makeJoiner(obj, ctx) {
	var join = obj.join;
	var select = obj.select;
	var onArray = obj.on;
	var outer = !! obj.outer;
	


	// this operation will support the 'with:' wizardry
	var withFN = _.isUndefined(obj.with) ? function(x) { return x; } : makePicker(obj.with, ctx);
	if(ctx.failed) return null;

	// 0. expected types
	assert(ctx, 'join must be an array', 'isArray', join);
	assert(ctx, 'on must be an array', 'isArray', onArray);
	if(select) assert(ctx, 'select must be a map', 'isMap', select);
	if(ctx.failed) return null;
	
	// 1. all members of select must be names that are in join
	var selectKeys = _.keys(select); 
	assert(ctx, 'select must use keys from join', 
		_.intersection(selectKeys, join).length == _.min([join.length, selectKeys.length]));
	if(ctx.failed) return null;

	// 2. the size of join and onArray must be identical, or onArray is '**'
	assert(ctx, 'join and onArray must be of same size', join.length == onArray.length || onArray == '**');
	if(ctx.failed) return null;

	// 3. the input must be an array whose size is the same as join
	assert(ctx, 'input data must be an array (of arrays)', 'isArray', ctx.inp);
	if(ctx.failed) return null;

	
	//4. all members of 'on' must be functionable
	var onAll = function(aCtx) { aCtx.outp = "**"; return aCtx; }; onAll.isFunctionated = true; //onAll is a functionated function that always generate the same join key
	var keyCalculators = onArray == '**' ? _.map(join, function(x) { return onAll }): 
	                                       _.map(onArray, function(on) { return functionator(on, ctx); });

	// are there null functionated ? I mean - did we fail for at least ?
	var nulls = _.findIndex(keyCalculators, function(x) { return _.isNull(x); });
	assert(ctx, 'all on-keys must be functionable', nulls<0);
	if(ctx.failed) return null;



	var FN = function(aCtx) {

		aCtx = withFN(aCtx);
		if(aCtx.failed) return aCtx;

		if(join.length == aCtx.inp.length) {
			var keyContext = _.map( keyCalculators, function(calc, i){
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
				var vals = _.pluck(keyContext, K);
				// outer join not supported yet
				vals = exports.longCartesian(vals, outer);
				if(vals && vals.length>0) {
					outs = outs.concat(vals);
				}
			});

			aCtx.outp = makeMerger(join,select)(outs);
			return aCtx;
		}else{
			aCtx.failed =true;
			aCtx.failures.push(["join operation expects " + join.length + " parameters but " + aCtx.inp.length + " were passed"]);
			return aCtx;
		}
	};
	FN.isFunctionated = true;

	return FN;

}
exports.makeJoiner=makeJoiner;


exports.examples = {
	'alice' : [ {a:1, b:1}, {a:2, b:4}, {a:3, b:9}, {a:4, b:16} ],
	'bob' : [ { A: 'S0', B:7 }, {A: 'S3', B:10}, {A:'F7', B:11 } ],
	'clint': [ { U: "joe", age: 16}, {U: "mark", age: 45 }, {U: "zabou", age:29}, {U:"dave", age: 8} ],
	'barb': [ { user: "joe", city: 'Chicago'}, {user: "dave", city: 'Boston' }, {user: 'zabou', city: 'Paris'}, { user: 'mark', city: 'London'}]
};
